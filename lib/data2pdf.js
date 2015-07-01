/*jslint node: true*/

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
            "top"   : "30mm",
            "right" : "30mm",
            "bottom": "30mm",
            "left"  : "30mm"
        }
    };
    pdf.create(html, opts).toFile(path, function (err, res) {
        if (err) {
            return console.error("error producing pdf at " + path + "\n" + err);
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

function mailpdf(to, subject, html, attachments) {
    var tx = getMailTransporter(),
        mail = {
            "from"   : "chmp@example.com",
            "to"     : to,
            //TODO: consider cc: or bcc: for local copy
            "subject": subject,
            "html"   : html
        },
        atts;

    //TODO: think about replacing img ref in html with cid: attachment-refs

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


    //TODO --> eenduidige logging van wat wel en niet verstuurd is.
    tx.sendMail(mail, function (err, info) {
        if (err) {
            return console.error(err);
        } // else
        console.log("message sent: " + info.response);
    });
}

function formatMoney(val) {
    return ("€ " + String(Number(val.replace(',', '.')).toFixed(2)).replace('.', ','));
}

function sortKeyFromDate(dateFmt) {
    var parts = dateFmt.split('/');
    return (((parts[2] * 100) + parts[1]) * 100) + parts[0];
}

function preProcessInput(inputFile, cb, yearmonth) {
    var inputs = {},
        counts = {lines : 0, actlines : 0, records: 0, nocode: 0, zerocode: 0, noymonth: 0, nomail: 0};

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
            counts.nomail += 1;
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
                "totaal"        : data.NotaSum,
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

function processInput(inputFile, cb, yearmonth) {
    preProcessInput(inputFile, function (inputs) {
        inputs.forEach(function (data) {
            cb(data);
        });
    }, yearmonth);
}

function recordProcessor(outputDir, template, nomail, mailfield, subject) {

    //TODO for now we know mails work, so disbale mail hardcoded untill we an go live
    nomail = true;
    //TODO remove above - in phase 2 test with marc.portier+chpm_<<data.name>>@gmail.com

    return function (data) {
        var html, bareFile = path.join(outputDir, String(data.nota_nr)),
            htmlFile = bareFile + ".html",
            pdfFile = bareFile + ".pdf",
            mailto = data[mailfield];

        html = createhtml(template, data);

        fs.writeFile(htmlFile, html, function (err) {
            if (err) {
                return console.error(err);
            }

            createpdf(html, pdfFile, function () {
                if (!nomail) {
                    mailpdf(mailto, subject, html, [pdfFile]);
                } else {
                    console.log("supressed mail '" + subject + "' to --> " + mailto);
                }
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

    //TODO check if outputDir exists
    fs.mkdir(outputDir);

    processInput(dataFile, recordProcessor(outputDir, template, cmd.nomail, cmd.mailfield, subject), yearmonth);
}

module.exports.doIt = runCommand;
