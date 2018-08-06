# Pushgateway Grouping Pruner

## Introduction

If you have dealt with Pushgateway more than just superficially, you will have run in to the issue that the Prometheus Pushgateway never automatically "forgets" any metrics which has been pushed to it. This is somewhat tedious, especially if you are using more than one source of data, and you don't want the data from different sources to overwrite each other.

What you do then is that you use "groupings" when you push to the Pushgateway, and this is when things get stupid.

Imagine you have two instances pushing data to your Pushgateway, let's call them `A` and `B`; they each push to their own "instance grouping", using the `:9091/metrics/job/<job_name>/instance/<instance_name>` end point, i.e. `:9091/metrics/job/monitor/instance/A` and `/B`.

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
`DEBUG` | (empty) | Specify `true` to get debug messages into the logs

## Deployment

This thing is most easily deployed as a sidecar to the Prometheus Pushgateway; it will be able to call the Pushgateway API at `http://localhost:9091` (the default) and will just work. The image has only been tested in a Kubernetes environment, and is not proven to run anywhere else (and of course we do not guarantee anything). There is not anything which speaks against running it outside of Kubernetes, but we won't run to help you in getting it up and running.

Haufe-Lexware has pre-built images which are pushed to the Docker Hub. The image name is `haufelexware/pushgateway-pruner:<version>`. Please note that there will be **no `latest` tag**. We believe you should always use specifically tagged images, and thus don't push `latest`.

### Sample deployment YAML

This is a sample deployment YAML for the `pushgateway` and `pushgateway-pruner` deployed in the same Pod:

```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: pushgateway
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pushgateway
  template:
    metadata:
      name: pushgateway
      labels:
        app: pushgateway
      annotations:
        prometheus.io/path: /metrics
        prometheus.io/port: "9091"
        prometheus.io/scrape: "true"      
    spec:
      containers:
      - name: pushgateway
        image: prom/pushgateway:v0.4.0
        resources:
          requests:
            cpu: "25m"
            memory: "50Mi"
          limits:
            cpu: "50m"
            memory: "100Mi"
        ports:
        - name: pushgateway
          containerPort: 9091
      - name: pushgateway-pruner
        image: haufelexware/pushgateway-pruner:0.1.0
        resources:
          requests:
            cpu: "5m"
            memory: "50Mi"
          limits:
            cpu: "10m"
            memory: "100Mi"
        env:
        - name: PRUNE_THRESHOLD
          # Prune metrics after ten minutes
          value: "600"
        - name: PRUNE_INTERVAL
          # Check for stale metrics every 30 seconds
          value: "30"
```

Sample settings for `PRUNE_THRESHOLD` and `PRUNE_INTERVAL` are added; override `PUSHGATEWAY_URL` if needed; if you use a deployment like above, the default URL will already be correct (`http://localhost:9091`). Adapt the version of the pruner image to the latest release, and remember to check back once in a while for new releases.

## Building your own image

Many companies don't especially like to pull in images they have not built by themselves (Haufe-Lexware is one of those as well). Therefore, `pushgateway-pruner` provides a couple of scripts which makes it fairly easy to build and push your own image of the `pushgateway-pruner`. These can be found in the [build](build) folder.

### `build-release.sh`

The `build-release.sh` script does the following:

* Validates the environment and checks the input parameters
* Downloads the code of `pushgateway-pruner` for a **specific tag**; this is not meant for daily development, this is for **creating images from released source code**
* Builds a docker image from the downloaded source code
* Optionally: Pushes the docker image to a docker registry

Call the script without parameters for a description.

### Jenkinsfile

We have also provided a sample `Jenkinsfile` which you can use to build the project **for a specific release, from source code** on your own Jenkins infrastructure. Please note: These scripts all download the code from **this** repository on GitHub; in case you want to build from a different fork, you will need to do a couple of adaptions.

The [Jenkinsfile](build/Jenkinsfile) contains a couple of `TODO` marks where you need to adapt the code when copy/pasting it into your Jenkins system as a "Pipeline". Copy/paste the copy directly into Jenkins; this is not what you would usually do, but it's not possible to further meta-parametrize this so that you could use this repository directly (but I'm open for suggestions).

# Development

Prereqs: Node 10, npm 6.

Short intro:

```
$ npm install
...
$ export PUSHGATEWAY_URL=<url of pushgateway>
$ node index.js
...
```

Locally, the pruner will work with a port forwarded end point of a Pushgateway from a Kubernetes cluster; this makes testing and developing quite easy.

Building a local docker image is also straightforward:

```
$ docker build -t <your tag here> .
```

## Tests

Yes, tests would be good. There aren't any right now. But this thing actually works.
