/*jslint node: true regexp:true */

"use strict";

var jade = require('jade'),             // http://jade-lang.com/api/
    pdf = require('html-pdf'),          // https://www.npmjs.com/package/html-pdf
    nodemailer = require('nodemailer'), // http://www.nodemailer.com/
    rwcsv = require('./rwcsv.js'),
    fs = require('fs'),
    path = require('path');

function createJadeTemplate(tplFile) {
    var options = { pretty: true};

    return jade.compileFile(tplFile, options);
}

function createhtml(tpl, record) {
    var html = tpl(record);
    return html;
}

function createpdf(html, path, cb) {
    var opts = {
        "format": 'A4',
        "border": {
            "top"   : "15mm",
            "right" : "25mm",
            "bottom": "15mm",
            "left"  : "25mm"
        }
    };
    pdf.create(html, opts).toFile(path, function (err, res) {
        if (err) {
            console.error("***ERROR*** producing pdf " + path + ":\t" + err);
        } //else
        cb(res);
    });
}

function getMailTransporter() {
    // https://github.com/andris9/nodemailer-smtp-transport
    return nodemailer.createTransport({
        host: "mail.westtoer.be"
    });
}

function mailpdf(from, to, copy, subject, html, attachments, done) {
    var tx = getMailTransporter(),
        // hack making the image work in mailed html
        html = html.replace(/src="file:\/\/[^"]*"/g,"src=\"http://www.westtoer.be/sites/westtoer/files/westtoer-logo.jpg\""),
        //TODO: think about replacing img ref in html with cid: attachment-refs
        mail = {
            "from"   : from,
            "to"     : to,
            "subject": subject,
            "html"   : html
        },
        atts;

    

    if (copy) {
        mail.cc = from;
    }


    if (attachments && attachments.length) {
        atts = [];
        attachments.forEach(function (attFile) {
            var att = {};
            att.path = attFile;
            att.filename = path.basename(attFile);
            atts.push(att);
        });
        mail.attachments = atts;
    }


    tx.sendMail(mail, function (err, info) {
        if (err) {
            console.error("***ERROR*** message not send to %s: %s", to, err);
        } else {
            console.log("message sent to %s: %s", to, info.response);
        }
        done();
        return;
    });
}

function formatMoney(val) {
    val = val.replace(/[^0-9,.]/g,"");
    var f = "€ " + String(Number(val.replace(',', '.')).toFixed(2)).replace('.', ',');
    return f;
}

function sortKeyFromDate(dateFmt) {
    var parts = dateFmt.split('/');
    return (((parts[2] * 100) + parts[1]) * 100) + parts[0];
}

function preProcessInput(inputFile, cb, yearmonth) {
    var inputs = {},
        counts = {lines : 0, actlines : 0, records: 0, nocode: 0, zerocode: 0, noymonth: 0, noaddrs: 0};

    function done() {
        var values = [], keys = Object.keys(inputs);
        console.log("done reading inputs: %j ==> %d", counts, keys.length);
        keys.forEach(function (code) {
            var input = inputs[code];
            input.prestaties.sort(function (a, b) {
                return (a.sort - b.sort);
            });
            values.push(input);
        });
        cb(values);
    }

    function handle(data) {
        counts.lines += 1;

        if (String(data.Notacode).trim().length === 0) {
            counts.nocode += 1;
            return; // no need to render this
        }
        if (data.Notacode.match(/ZZZZZ/g)) {
            counts.zerocode += 1;
            return; // no need to render this
        }

        data.yearmonth = Number(data.Jaar) * 100 + Number(data.Maand);
        if (data.yearmonth !== yearmonth) {
            counts.noymonth += 1;
            return; // no need to render these
        }

        if (String(data.Email).trim().length === 0) {
            counts.noaddrs += 1;
            throw "data error - no email address for" + data.Notacode;
        }

        counts.actlines += 1;

        var current = inputs[data.Notacode]; // check if there already is one

        if (!current) { // if not
            // create record and add first line
            current = {
                "email"         : data.Email,
                "nota_nr"       : String(data.Jaar * 10 + data.Maand) + "-" + String(data.NotaNr),
                "ref_code"      : data.Notacode,
                "ref_ax"        : data.Axnummer,
                "datum"         : data.Datumnota,
                "periode"       : data.MaandFormat,
                "projectnaam"   : data.NaamOnderzoek,
                "prestaties"    : [],
                "naam_voornaam" : data.NaamVoornaam,
                "adres"         : data.Adres,
                "totaal"        : formatMoney(data.NotaSum),
                "bic"           : data.BICnummer,
                "iban"          : data.Rekeningnummer
            };
            inputs[current.ref_code] = current;
            counts.records += 1;
        } else {  // if there was already a line for this...
            if (current.ref_code !== data.Notacode) {
                throw "data error, not matching Notacode " + current.ref_code + " versus " + data.Notacode;
            }
            if (current.email !== data.Email) {
                throw "data error, not matching email for " + current.ref_code;
            }
        }
        current.prestaties.push({
            "sort"      : sortKeyFromDate(data.Datum),
            "datum"     : data.Datum,
            "onderzoek" : data.NaamOnderzoek,
            "bedrag"    : formatMoney(data.Dagvergoeding)
        });
    }

    rwcsv.read(inputFile, done, handle, ";", "cp1252");
}

function processInput(inputFile, yearmonth, cb) {
    preProcessInput(inputFile, function (inputs) {
        inputs.forEach(function (data) {
            cb(data);
        });
    }, yearmonth);
}

function recordProcessor(outputDir, template, mailcfg) {

    var mailfld = mailcfg.field,
        nomail = mailcfg.nomail || false,
        gmail = mailcfg.gmail.split('@')[0],
        copy = mailcfg.copy || false,
        subject = mailcfg.subject,
        from = mailcfg.from || "no-reply@westtoer.be",

        period = mailcfg.period || 5000,
        limit = mailcfg.limit || 15,

        atwork = 0,
        inwait = 0,
        done = 0,
        todo = 0;

    function reportProgress(evt) {
        console.log("Q %s\t: done/todo == %d/%d --\t-- atwork/inwait == %d/%d", evt, done, todo, atwork, inwait);
    }

    function queueWork(fn, evt) {
        if (atwork < limit) {
            atwork += 1;
            fn();
            reportProgress("start");
        } else {
            inwait += 1;
            setTimeout(function () {
                inwait -= 1;
                queueWork(fn);
            }, period);
            reportProgress("queue");
        }
    }

    function doneWork() {
        atwork -= 1;
        done += 1;
        reportProgress("done.");
    }

    return function (data) {
        var html, bareFile = path.join(outputDir, String(data.nota_nr)),
            htmlFile = bareFile + ".html",
            pdfFile = bareFile + ".pdf",
            mailto = data[mailfld];

        if (gmail) {
            mailto = mailto.replace(/@/g, "-AT-").replace(/[^\d\w-_\.]/g, "");
            mailto = gmail + "+chpm-" + mailto + "@gmail.com";
        }

        todo += 1;
        queueWork(function () {
            html = createhtml(template, data);

            fs.writeFile(htmlFile, html, function (err) {
                if (err) {
                    console.error(err);
                    doneWork();
                    return;
                }

                //else

                createpdf(html, pdfFile, function () {
                    if (!nomail) {
                        mailpdf(from, mailto, copy, subject, html, [pdfFile], doneWork);
                    } else {
                        console.log("supressed mail '" + pdfFile + "' to --> " + mailto);
                        doneWork();
                    }
                });
            });
        });
    };
}

function runCommand(cmd) {
    console.log(cmd);
    var template = createJadeTemplate(cmd.template),
        dataFile = cmd.input,
        yearmonth = Number(cmd.ymonth),
        outputDir = path.join(cmd.output, String(yearmonth)),
        subject = cmd.subject.replace(/%ymonth%/, yearmonth);

    if (isNaN(yearmonth) || yearmonth < 201000) {
        throw "can't use provided yearmonth setting: " + cmd.ymonth;
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    processInput(dataFile, yearmonth, recordProcessor(outputDir, template, {
        field:   cmd.mailfield,
        nomail:  cmd.nomail,
        gmail:   cmd.gmail || "",
        copy:    cmd.copy,
        subject: subject,
        from:    cmd.from,
        periode: cmd.period,
        limit:   cmd.limit
    }));
}

module.exports.doIt = runCommand;
