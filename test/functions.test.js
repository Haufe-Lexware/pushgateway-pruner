const axios = require('axios');
const { resolve, pruneGroups, parseLabels } = require('./../src/functions')

jest.mock('axios');

const DEFAULT_METRICS_DATA =
    'go_gc_duration_seconds{quantile="0"} 2.56e-05\n' +
    '# HELP push_time_seconds Last Unix time when changing this group in the Pushgateway succeeded.\n' +
    '# TYPE push_time_seconds gauge\n' +
    'push_time_seconds{instance="instance_1",job="application_1"} 1.5806880000000000e+09\n' +
    'push_time_seconds{instance="instance_2",job="application_2"} 1.5831936000000000e+09\n' +
    'push_time_seconds{instance="instance_3",job="application_3"} 1.5858720000000000e+09\n' +
    '# HELP pushgateway_http_requests_total Total HTTP requests processed by the Pushgateway, excluding scrapes.\n' +
    '# TYPE pushgateway_http_requests_total counter\n' +
    'pushgateway_http_requests_total{code="200",handler="healthy",method="get"} 12550\n' +
    'pushgateway_http_requests_total{code="200",handler="push",method="post"} 8445\n' +
    'pushgateway_http_requests_total{code="200",handler="ready",method="get"} 12550'

function mockProcessEnv(envVar, envValue) {
    process.env[envVar] = envValue;
}

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

describe('Functions test', () => {
    describe('Prune groups', () => {

        beforeAll(() => {
            jest.useFakeTimers('modern');
            jest.setSystemTime(Date.UTC(2020, 2, 3));

            mockGetMetricsResponse();
            mockDeleteMetricsResponse();
        });

        beforeEach(() => {
            expect(axios.delete).toHaveBeenCalledTimes(0);
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

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

    describe('Resolve function test', () => {
        const envVar = 'TEST_ENV_VAR';
        const defaultValue = 'default_value';
        const defaultProcessEnvValues = { ...process.env };

        beforeEach(() => {
            jest.resetModules();
            process.env = { ...defaultProcessEnvValues };
        });

        afterAll(() => {
            process.env = defaultProcessEnvValues; // Restore old environment
        });

        test('Return process env value string when specified', () => {
            const expectedValue = 'expected_value';
            mockProcessEnv(envVar, expectedValue);

            const responseValue = resolve(envVar, defaultValue);

            expect(responseValue).toBe(expectedValue);
        });

        test('Return process env value integer when specified', () => {
            const expectedValue = 123;
            mockProcessEnv(envVar, expectedValue);

            const responseValue = resolve(envVar, defaultValue);

            expect(responseValue).toBe(expectedValue);
        });

        test('Return default process env value when no specified', () => {
            const responseValue = resolve(envVar, defaultValue);

            expect(responseValue).toBe(defaultValue);
        });
    });

    describe('Parse labels function test', () => {
        test('Return the specific labels', () => {
            const stringLabels = 'instance="instance_1",job="application_1"';
            const expectedValue = {
                instance: 'instance_1',
                job: 'application_1'
            };

            const responseValue = parseLabels(stringLabels);

            expect(responseValue).toEqual(expectedValue);
        });

        test('Return empty string in labels that does not have a value', () => {
            const stringLabels = 'instance="",job="application_1"';
            const expectedValue = {
                instance: '',
                job: 'application_1'
            };

            const responseValue = parseLabels(stringLabels);

            expect(responseValue).toEqual(expectedValue);
        });

        test('Return empty if no labels', () => {
            const stringLabels = '';
            const expectedValue = {};

            const responseValue = parseLabels(stringLabels);

            expect(responseValue).toEqual(expectedValue);
        });
    });
})

