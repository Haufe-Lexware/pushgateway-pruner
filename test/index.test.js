const axios = require('axios')
const { pruneGroups, interval } = require('./../index')

jest.mock('axios');

const DEFAULT_METRICS_DATA =
    'go_gc_duration_seconds{quantile="0"} 2.56e-05\n' +
    '# HELP push_time_seconds Last Unix time when changing this group in the Pushgateway succeeded.\n' +
    '# TYPE push_time_seconds gauge\n' +
    'push_time_seconds{instance="instance_1",job="application_1"} 1.5806844000000000e+09\n' +
    'push_time_seconds{instance="instance_2",job="application_2"} 1.5831900000000000e+09\n' +
    'push_time_seconds{instance="instance_3",job="application_3"} 1.5858648000000000e+09\n' +
    '# HELP pushgateway_http_requests_total Total HTTP requests processed by the Pushgateway, excluding scrapes.\n' +
    '# TYPE pushgateway_http_requests_total counter\n' +
    'pushgateway_http_requests_total{code="200",handler="healthy",method="get"} 12550\n' +
    'pushgateway_http_requests_total{code="200",handler="push",method="post"} 8445\n' +
    'pushgateway_http_requests_total{code="200",handler="ready",method="get"} 12550'

function mockGetMetricsResponse(metricsData = DEFAULT_METRICS_DATA, statusCode = 200) {
    axios.get.mockResolvedValue({
        status: statusCode,
        data: metricsData
    });
}

function mockDeleteMetricsResponse(statusCode = 200) {
    axios.delete.mockResolvedValue({
        status: statusCode
    });
}

describe('PushGateway Pruner', () => {

    beforeAll(() => {
        jest.useFakeTimers('modern');
        jest.setSystemTime(new Date(2020, 2, 3));

        mockGetMetricsResponse();
        mockDeleteMetricsResponse();
    });

    afterEach(() => {
        jest.useRealTimers();

        clearInterval(interval);

        jest.clearAllMocks();
    })

    test('Simple prune process with one metric to be prune', async () => {
        await pruneGroups('PUSHGATEWAY_URL', 60);

        expect(axios.delete).toHaveBeenCalledTimes(1);
    });

    test('Metric with no instance should not be deleted', async () => {
        const metricsData =
            'push_time_seconds{instance="",job="application_1"} 1.5806844000000000e+09';

        mockGetMetricsResponse(metricsData);

        await pruneGroups('PUSHGATEWAY_URL', 60);

        expect(axios.delete).toHaveBeenCalledTimes(0);
    });

    test('When GET metric has an error raise an exception', async () => {
        mockGetMetricsResponse('', 500);

        const request = pruneGroups('PUSHGATEWAY_URL', 60);

        await expect(request).rejects.toThrow();
    });
})
