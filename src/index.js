const { resolve, pruneGroups } = require('./functions');
const logger = require('./logger');

let PUSHGATEWAY_URL = resolve('PUSHGATEWAY_URL', 'http://localhost:9091');
if (!PUSHGATEWAY_URL.endsWith('/')) {
    PUSHGATEWAY_URL += '/'
}
logger.info(`Pushgateway URL: ${PUSHGATEWAY_URL}`);

const INTERVAL_SECONDS = resolve('PRUNE_INTERVAL', 60);
logger.info(`Prune interval: ${INTERVAL_SECONDS} seconds.`);

const PRUNE_THRESHOLD_SECONDS = resolve('PRUNE_THRESHOLD', 600);
logger.info(`Prune threshold: ${PRUNE_THRESHOLD_SECONDS} seconds.`);

const interval = setInterval(
    () => pruneGroups(PUSHGATEWAY_URL, PRUNE_THRESHOLD_SECONDS),
    INTERVAL_SECONDS * 1000
);

module.exports = {
    pruneGroups,
    interval
}
