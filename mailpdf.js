/*jslint node: true */
/*jslint es5: true */
/*jslint nomen: true */

var data2pdf = require('./lib/data2pdf'),
    path = require('path'),
    argv = require('yargs')
        .usage('Produceert PDF files volgens een JADE template uit CSV data.\nUsage: $0')
        .example('$0  -t template/kc/enquete-prestaties.jade -i data/kc/enquete/2015/test.csv', 'Will process the data in the files.')
        .describe('template', 'Location of JADE template to use.')
        .alias('t', 'template')
        .default('t', path.join(__dirname, 'data', 'template.jade'))
        .describe('input', 'Location of data.csv to work with')
        .alias('i', 'input')
        .default('input', path.join(__dirname, 'data', 'test', 'data.csv'))
        .describe('ymonth', 'YYYYMM code of the data to be processed')
        .alias('y', 'ymonth')

        .describe('mailfield', 'name of the email-field in the csv')
        .alias('m', 'mailfield')
        .default('mailfield', 'email')
        .describe('subject', 'subject for the email to use')
        .alias('s', 'subject')
        .default('subject', 'Westtoer nota vrijwilligerswerk (%ymonth%)')
        .describe('nomail', 'don\'t send email, just produce pdf and end')
        .alias('n', 'nomail')
        .describe('output', 'location for the pddf to be stored')
        .alias('o', 'output')
        .default('o', path.join('tmp', 'mkpdf', 'output', 'test'))

        .demand(["ymonth"])
        .argv;

data2pdf.doIt(argv);
