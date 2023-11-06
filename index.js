'use strict'

const axios = require('axios')
const logger = require('./logger')

let PUSHGATEWAY_URL = resolve('PUSHGATEWAY_URL', 'http://localhost:9091')
if (!PUSHGATEWAY_URL.endsWith('/'))
    PUSHGATEWAY_URL += '/'
logger.info(`Pushgateway URL: ${PUSHGATEWAY_URL}`)

const INTERVAL_SECONDS = resolve('PRUNE_INTERVAL', 60)
const PRUNE_THRESHOLD_SECONDS = resolve('PRUNE_THRESHOLD', 600)
logger.info(`Prune interval: ${INTERVAL_SECONDS} seconds.`)
logger.info(`Prune threshold: ${PRUNE_THRESHOLD_SECONDS} seconds.`)

async function pruneGroups() {
    logger.info('Starting prune process...');

    // Get metrics request from Prometheus push gateway
    let metrics = null;
    try {
        metrics = await getMetrics(PUSHGATEWAY_URL);
    } catch (e) {
        throw new Error(`GET /metrics from ${PUSHGATEWAY_URL} failed. Cause: ${e}`)
    }

    // Get 'push_time_seconds' groups and filter the ones that are above pruneThresholdSeconds
    const groupings = parseGroupings(metrics)
    const filteredGroupings = filterOldGroupings(groupings)
    logger.info(`Found ${groupings.length} grouping(s), of which ${filteredGroupings.length} will be pruned`)

    if (filteredGroupings.length > 0) {
        filteredGroupings.map((filteredGroup) => {
                try {
                    deleteGrouping(filteredGroup)
                } catch (e) {
                    logger.error(`Pruning group ${filteredGroup} failed.`)
                }
            }
        )

        logger.info('Pruning process finished');
    }
}

function resolve(envVar, defaultValue) {
    logger.debug(`resolve(${envVar}, ${defaultValue})`)
    const envValue = process.env[envVar]
    if (!!envValue) {
        logger.debug(`found env value ${envValue}`)
        const tryInt = parseInt(envValue)
        if (!isNaN(tryInt))
            return tryInt
        return envValue
    }
    logger.debug(`returning default value ${defaultValue}`)
    return defaultValue
}

async function getMetrics() {
    logger.debug('getMetrics()')
    const getMetricsResponse = await axios.get(PUSHGATEWAY_URL + 'metrics', {
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
    const lines = metrics.split('\n')
    const pushGroups = []
    for (let i = 0; i < lines.length; ++i) {
        const line = lines[i]
        if (line.startsWith("push_time_seconds")) {
            const labels = parseLabels(line.substring(line.indexOf('{') + 1, line.indexOf('}')))
            const timestamp = new Date(parseFloat(line.substring(line.indexOf('}') + 1).trim()) * 1000)
            pushGroups.push({
                timestamp: timestamp,
                labels: labels
            })
        }
    }
    for (let i = 0; i < pushGroups.length; ++i)
        logger.debug('Grouping', pushGroups[i])
    return pushGroups
}

function parseLabels(labels) {
    logger.debug(`parseLabels(${labels}`)
    if (!labels.trim()) {
        logger.debug('no labels found')
        return {}
    }
    const labelList = labels.split(',')
    const labelMap = {}
    for (let i = 0; i < labelList.length; ++i) {
        const keyValue = labelList[i].split('=')
        let value = keyValue[1]
        if (value.startsWith('"'))
            value = value.substring(1, value.length - 1)
        labelMap[keyValue[0]] = value
    }
    return labelMap
}

function filterOldGroupings(groupings) {
    logger.debug('filterOldGroupings()');
    const filteredGroupings = []
    const now = new Date()
    for (let i = 0; i < groupings.length; ++i) {
        if ((now - groupings[i].timestamp) > PRUNE_THRESHOLD_SECONDS * 1000) {
            filteredGroupings.push(groupings[i])
        }
    }
    for (let i = 0; i < filteredGroupings.length; ++i)
        logger.debug('Filtered Grouping', filteredGroupings[i])
    return filteredGroupings
}

async function deleteGrouping(grouping) {
    logger.debug('deleteGrouping()', grouping)

    const job = grouping.labels.job
    // This will most probably be "instance"
    const labelName = findLabelName(grouping.labels)
    if (!labelName)
        throw new Error(`Grouping from job ${job} does not have suitable labels (e.g. instance)`)
    const labelValue = grouping.labels[labelName]
    if (!labelValue) {
        logger.info(`Did not delete grouping from job ${job} because value of label ${labelName} is empty.`)
        return;
    }

    const url = PUSHGATEWAY_URL + encodeURIComponent(`metrics/job/${job}/${labelName}/${labelValue}`)
    logger.debug(`Delete URL: ${url}`)
    const deleteResponse = await axios.delete(url, {
        timeout: 2000
    });

    if (!deleteResponse || deleteResponse && (deleteResponse.status >= 300)) {
        logger.debug(`ERROR: DELETE ${url} failed`)
        let msg = 'unknown failure'
        if (deleteResponse) {
            msg = `unexpected status code ${deleteResponse.status}`
        }
        logger.debug(msg)
        throw new Error(`DELETE ${url} failed: ${msg}`)
    }

    logger.debug(`DELETE ${url} succeeded, status code ${deleteResponse.status}`)
    logger.info('Deleted grouping', grouping.labels)
    return;
}

function findLabelName(labels) {
    for (let propName in labels) {
        if (propName === 'job')
            continue
        return propName
    }
    return null
}

const interval = setInterval(pruneGroups, INTERVAL_SECONDS * 1000)

module.exports = {
    pruneGroups,
    interval
}
