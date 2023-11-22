const axios = require('axios')
const logger = require('./logger')

const METRIC_NAME = 'push_time_seconds';

async function pruneGroups(pushgatewayUrl, pruneThresholdSeconds) {
    logger.info('Starting prune process...');

    // Get metrics request from Prometheus push gateway
    let metrics = null;
    try {
        metrics = await getMetrics(pushgatewayUrl);
    } catch (e) {
        throw new Error(`GET /metrics from ${pushgatewayUrl} failed. Cause: ${e}`);
    }

    // Get 'push_time_seconds' groups and filter the ones that are above pruneThresholdSeconds
    const groupings = parseGroupings(metrics);
    const filteredGroupings = filterOldGroupings(groupings, pruneThresholdSeconds);
    logger.info(`Found ${groupings.length} grouping(s), of which ${filteredGroupings.length} will be pruned`);

    await Promise.all(filteredGroupings.map(async (filteredGroup) => {
            try {
                await deleteGrouping(filteredGroup, pushgatewayUrl);
            } catch (e) {
                logger.error(`Pruning group ${filteredGroup} failed.`);
            }
        }
    ));

    logger.info('Pruning process finished');
}

function resolve(envVar, defaultValue) {
    logger.debug(`Resolving environment variable '${envVar}' (default-value='${defaultValue}')`);

    const envValue = process.env[envVar];
    if (!!envValue) {
        logger.debug(`Found environment variable '${envVar}' with value '${envValue}'`);
        const tryInt = parseInt(envValue);
        return isNaN(tryInt) ? envValue : tryInt;
    }

    logger.debug(`No environment value found for '${envVar}'. Returning default value '${defaultValue}'`);
    return defaultValue;
}

async function getMetrics(pushgatewayUrl) {
    logger.debug('Trying to get metrics from pushgateway...');

    const getMetricsResponse = await axios.get(pushgatewayUrl + 'metrics', {
        timeout: 2000
    });

    if (!getMetricsResponse) {
        logger.debug('GET /metrics returned an error');
        throw new Error('GET /metrics returned an error');
    }
    if (getMetricsResponse.status !== 200) {
        logger.debug('GET /metrics not status 200');
        throw new Error(`GET /metrics return unexpected status code ${getMetricsResponse.status}`);
    }

    return getMetricsResponse.data;
}

function parseGroupings(metrics) {
    logger.debug('parseGroupings()');
    const lines = metrics.split('\n');
    const pushGroups = [];
    for (let i = 0; i < lines.length; ++i) {
        const line = lines[i];
        if (line.startsWith(METRIC_NAME)) {
            const labels = parseLabels(line.substring(line.indexOf('{') + 1, line.indexOf('}')));
            const timestamp = new Date(parseFloat(line.substring(line.indexOf('}') + 1).trim()) * 1000);
            pushGroups.push({
                timestamp: timestamp,
                labels: labels
            })
        }
    }
    for (let i = 0; i < pushGroups.length; ++i) {
        logger.debug('Grouping', pushGroups[i]);
    }
    return pushGroups;
}

function parseLabels(labels) {
    logger.debug(`parseLabels(${labels}`);
    if (!labels.trim()) {
        logger.debug('no labels found');
        return {};
    }
    const labelList = labels.split(',');
    const labelMap = {};
    for (let i = 0; i < labelList.length; ++i) {
        const keyValue = labelList[i].split('=');
        let value = keyValue[1];
        if (value.startsWith('"')) {
            value = value.substring(1, value.length - 1);
        }
        labelMap[keyValue[0]] = value;
    }
    return labelMap;
}

function filterOldGroupings(groupings, pruneThresholdSeconds) {
    logger.debug('filterOldGroupings()');
    const filteredGroupings = [];
    const now = new Date();
    for (let i = 0; i < groupings.length; ++i) {
        if ((now - groupings[i].timestamp) > pruneThresholdSeconds * 1000) {
            filteredGroupings.push(groupings[i]);
        }
    }
    for (let i = 0; i < filteredGroupings.length; ++i) {
        logger.debug('Filtered Grouping', filteredGroupings[i]);
    }
    return filteredGroupings;
}

async function deleteGrouping(grouping, pushgatewayUrl) {
    logger.debug('deleteGrouping()', grouping);

    const job = grouping.labels.job;
    // This will most probably be "instance"
    const labelName = findFirstNonJobLabel(grouping.labels);
    if (!labelName) {
        throw new Error(`Grouping from job ${job} does not have suitable labels (e.g. instance)`);
    }
    const labelValue = grouping.labels[labelName];
    if (!labelValue) {
        logger.info(`Did not delete grouping from job ${job} because value of label ${labelName} is empty.`)
        return;
    }

    const url = pushgatewayUrl + encodeURIComponent(`metrics/job/${job}/${labelName}/${labelValue}`);
    logger.debug(`Delete URL: ${url}`);
    const deleteResponse = await axios.delete(url, {
        timeout: 2000
    });

    if (!deleteResponse || deleteResponse && (deleteResponse.status >= 300)) {
        logger.debug(`ERROR: DELETE ${url} failed`);
        let msg = 'unknown failure';
        if (deleteResponse) {
            msg = `unexpected status code ${deleteResponse.status}`;
        }
        logger.debug(msg);
        throw new Error(`DELETE ${url} failed: ${msg}`);
    }

    logger.debug(`DELETE ${url} succeeded, status code ${deleteResponse.status}`);
    logger.info('Deleted grouping', grouping.labels);
}

function findFirstNonJobLabel(labels) {
    const nonJobLabel = Object.keys(labels)
        .find(propName => propName !== 'job');
    return nonJobLabel || null;
}

module.exports = {
    resolve,
    pruneGroups,
    parseLabels,
    findFirstNonJobLabel,
}
