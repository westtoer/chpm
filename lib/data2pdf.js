/*jslint node: true*/

"use strict";

var jade = require('jade'),     // http://jade-lang.com/api/
    pdf = require('html-pdf'),  //https://www.npmjs.com/package/html-pdf
    fs = require('fs'),
    path = require('path');

function createJadeTemplate(tplFile) {
    var options = { pretty: true};

    return jade.compileFile(tplFile, options);
}

function createhtml(tpl, record) {
    var html = tpl(record);

    console.log(">>HTML>>");
    console.log(html);

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
//        },
//        "header": {
//            "height"  : "25mm",
//            "contents": "<img src='http://intranet.westtoer.be/sites/default/files/westtoer-logo.jpg'>"
        }
    };
    pdf.create(html, opts).toFile(path, function (err, res) {
        if (err) {
            return console.error("error poducing pdf at " + path + "\n" + err);
        } //else
        cb(res);
    });
}

function mailpdf(to, subject, html, attachments) {
}

function processInput(inputFile, cb) {
    var data = {
        "email"      : "mpt@westtoer.be",
        "nota_nr"    : "201505-180",
        "ref_code"   : "BLI15-156-201505",
        "ref_ax"     : "L001063",
        "datum"      : "31 mei 2015",
        "periode"    : "mei 2015",
        "projectnaam": "Vakantiegangers aan de Kust: Blitz",
        "prestaties" : [
            {"datum": "17 mei 2015", "onderzoek": "Vakantiegangers aan de Kust: Blitz", "bedrag": "€ 32,71"},
            {"datum": "18 mei 2015", "onderzoek": "Vakantiegangers aan de Kust: Blitz", "bedrag": "€ 20,00"},
            {"datum": "31 mei 2015", "onderzoek": "Vakantiegangers aan de Kust: Blitz", "bedrag": "€ 32,71"}
        ],
        "voornaam"   : "Marc",
        "naam"       : "Portier",
        "straat_nr"  : "K. Astridlaan 79",
        "gemeente"   : "Bredene",
        "totaal"     : "€ 85,42",
        "bic"        : "BBRUBEBB",
        "iban"       : "BE77 3840 3927 1142"
    };

    cb(data);
}

function recordProcessor(outputDir, template) {
    return function (data) {
        var html, bareFile = path.join(outputDir, String(data.nota_nr)),
            htmlFile = bareFile + ".html",
            pdfFile = bareFile + ".pdf";

        html = createhtml(template, data);

        fs.writeFile(htmlFile, html, function (err) {
            if (err) {
                return console.error(err);
            }

            createpdf(html, pdfFile, function () {
                mailpdf(data.email, "todo subject", html, [pdfFile]);
            });
        });
    };
}

function runCommand(cmd) {
    console.log(cmd);
    var template = createJadeTemplate(cmd.template),
        dataFile = "todo path from args";

    processInput(dataFile, recordProcessor(cmd.output, template));
}

module.exports.doIt = runCommand;
