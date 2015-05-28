/*jslint node: true*/

"use strict";

// tip https://gist.github.com/RandomEtc/1803645
function createhtml(tpl, record) {

    // http://stackoverflow.com/questions/12445816/jade-template-inheritance-without-express
    // http://jade-lang.com/api/

    return "htmlfilelocation";
}

function createpdf(html) {
    // https://www.npmjs.com/package/html-pdf
    // needed or is html mail ok? or both?

    return "pdffilelocation";
}

function mailpdf(email, pdf) {
}

function runCommand(cmd) {
    console.log(cmd);
    var email = "mpt@westtoer.be",
        data = {"id"   : 3947569,
                "lines": [{"key": "label 1", "amount": "374.00 €"}, {"key": "label 1", "amount": "374.00 €"}],
                "name" : "Marc Portier"
               },
        template = "TODO",
        html,
        pdf;

    html = createhtml(template, data);
    pdf  = createpdf(html);
    mailpdf(email, pdf);
}

module.exports.doIt = runCommand;
