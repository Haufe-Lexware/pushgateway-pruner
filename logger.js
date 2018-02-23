'use strict';

const winston = require('winston')

let logLevel = process.env.DEBUG == 'true' ? 'debug' : 'info'

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            level: logLevel,
            timestamp: function () {
                return (new Date()).toISOString();
            },
            json: true,
            // This makes sure each log entry is single line
            stringify: (obj) => JSON.stringify(obj)
        })
    ]
})

module.exports = logger;
