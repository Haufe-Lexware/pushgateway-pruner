# Pushgateway Grouping Pruner

## Introduction

If you have dealt with Pushgateway more than just superficially, you will have run in to the issue that the Prometheus Pushgateway never automatically "forgets" any metrics which has been pushed to it. This is somewhat tedious, especially if you are using more than one source of data, and you don't want the data from different sources to overwrite each other.

What you do then is that you use "groupings" when you push to the Pushgateway, and this is when things get stupid.

Imagine you have two instances pushing data to your Pushgateway, let's call them `A` and `B`; they each push to their own "instance grouping", using the `:9090/metrics/job/<job_name>/instance/<instance_name>` end point, i.e. `:9090/metrics/job/monitor/instance/A` and `/B`.

Now instance `A` dies, and instead instance (read: Pod ID or some other unique identifier) `C` comes into life and starts pushing metrics. Pushgateway will (until it dies for whatever reason) happily expose the metrics of `A` for eternity even if `A` hasn't pushed any metrics for ages. This can lead to certain unwanted effects, such as non-existing instances affecting the current averages of the other instances.

Enter `pushgateway-pruner`.

## What does `pushgateway-pruner` do?

The `pushgateway-pruner` does the following:

* In defined intervals, checks all the groupings inside the Pushgateway (by using its `/metrics` endpoint)
* If a grouping has not been pushed to in `PRUNE_THRESHOLD` seconds, it will be deleted

Looking at the example from above, this means that the metrics of instance `A` would be deleted from the Pushgateway after a certain time.

## Configuration

Pass in the following configuration as environment variables

Env var | Default | Description
--------|---------|------------
`PUSHGATEWAY_URL` | `http://localhost:9091` | The URL of the Pushgateway API
`PRUNE_INTERVAL` | 60 | Interval in which stale groupings are checked for, in seconds
`PRUNE_THRESHOLD` | 600 | Age threshold after which a grouping is pruned, in seconds

## Build

```
docker build -t <insert your tag here> --pull .
```

There is no prebuilt image for this (at least not yet), so you will have to push this to your own preferred repository before you can use it in production. 

## Deployment

This thing is most easily deployed as a sidecar to the Prometheus Pushgateway; it will be able to call the Pushgateway API at `http://localhost:9091` (the default) and will just work.
