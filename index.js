'use strict'

const request = require('request')
const async = require('async')
const logger = require('./logger')

let PUSHGATEWAY_URL = resolve('PUSHGATEWAY_URL', 'http://localhost:9091')
if (!PUSHGATEWAY_URL.endsWith('/'))
    PUSHGATEWAY_URL += '/'
logger.info(`Pushgateway URL: ${PUSHGATEWAY_URL}`)

const INTERVAL_SECONDS = resolve('PRUNE_INTERVAL', 60)
const PRUNE_THRESHOLD_SECONDS = resolve('PRUNE_THRESHOLD', 600)
logger.info(`Prune interval: ${INTERVAL_SECONDS} seconds.`)
logger.info(`Prune threshold: ${PRUNE_THRESHOLD_SECONDS} seconds.`)

function pruneGroups() {
    logger.info('Starting prune process.');
    getMetrics((err, metrics) => {
        if (err) {
            logger.error(`GET /metrics from ${PUSHGATEWAY_URL} failed.`)
            logger.error(err)
            return
        }

        const groupings = parseGroupings(metrics)
        logger.info(`Found ${groupings.length} grouping(s)`)
        const filteredGroupings = filterOldGroupings(groupings)
        if (filteredGroupings.length > 0) {
            logger.info(`Will delete ${filteredGroupings.length} grouping(s)`);
            async.mapSeries(filteredGroupings, deleteGrouping, (err, results) => {
                if (err) {
                    logger.error('Pruning groupings failed.')
                    logger.error(err)
                    return
                }
                logger.info('Pruning successfully finished')
            })
        } else {
            logger.info('Nothing to prune.');
        }
    })
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

function getMetrics(callback) {
    logger.debug('getMetrics()')
    request.get({
        url: PUSHGATEWAY_URL + 'metrics',
        timeout: 2000
    }, (err, res, body) => {
        if (err) {
            logger.debug('GET /metrics returned an error');
            return callback(err);
        }
        if (res.statusCode !== 200) {
            logger.debug('GET /metrics not status 200');
            const msg = `GET /metrics return unexpected status code ${res.statusCode}`
            return callback(new Error(msg))
        }
        logger.debug('getMetrics() succeeded');
        return callback(null, body)
    })
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

function deleteGrouping(grouping, callback) {
    logger.debug('deleteGrouping()', grouping)

    const job = grouping.labels.job
    // This will most probably be "instance"
    const labelName = findLabelName(grouping.labels)
    if (!labelName)
        return new Error(`Grouping from job ${job} does not have suitable labels (e.g. instance)`)
    const labelValue = grouping.labels[labelName]
    if (!labelValue) {
        logger.info(`Did not delete grouping from job ${job} because value of label ${labelName} is empty.`)
        return callback(null)
    }

    const url = `${PUSHGATEWAY_URL}metrics/job/${job}/${labelName}/${labelValue}`
    logger.debug(`Delete URL: ${url}`)
    request.delete({
        url: url,
        timeout: 2000
    }, (err, res, body) => {
        if (err) {
            logger.debug(`ERROR: DELETE ${url} failed`)
            return callback(err)
        }
        if (!res || res && (res.statusCode >= 300)) {
            logger.debug(`ERROR: DELETE ${url} failed`)
            let msg = 'unknown failure'
            if (res) {
                msg = `unexpected status code ${res.statusCode}`
            } 
            logger.debug(msg)
            return callback(new Error(msg))
        }

        logger.debug(`DELETE ${url} succeeded, status code ${res.statusCode}`)
        logger.info('Deleted grouping', grouping.labels)
        return callback(null)
    })
}

function findLabelName(labels) {
    for (let propName in labels) {
        if (propName === 'job')
            continue
        return propName
    }
    return null
}

setInterval(pruneGroups, INTERVAL_SECONDS * 1000)
