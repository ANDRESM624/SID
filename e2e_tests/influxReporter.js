const { InfluxDB, Point } = require('@influxdata/influxdb-client');
require('dotenv').config();

class InfluxReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;

    const token = process.env.INFLUX_TOKEN;
    const org = process.env.INFLUX_ORG;
    this.bucket = process.env.INFLUX_BUCKET;
    const url = process.env.INFLUX_URL || 'http://localhost:8086';

    if (token && org && this.bucket) {
      this.client = new InfluxDB({ url, token });
      this.writeApi = this.client.getWriteApi(org, this.bucket, 'ns');
      console.log('✅ InfluxDB Reporter inicializado');
    } else {
      console.warn('⚠️ Variables de InfluxDB no configuradas. Los resultados no se enviarán.');
    }
  }

  onTestResult(test, testResult, aggregatedResult) {
    if (!this.writeApi) return;

    for (const result of testResult.testResults) {
      const endpointName = result.title;
      const status = result.status; // 'passed', 'failed', 'pending'
      const duration = result.duration || 0; // en ms

      if (status !== 'pending') {
        const point = new Point('test_results')
          .tag('endpoint_name', endpointName)
          .tag('status', status)
          .floatField('latency_ms', duration)
          .intField('failed', status === 'failed' ? 1 : 0)
          .intField('passed', status === 'passed' ? 1 : 0);

        this.writeApi.writePoint(point);
      }
    }
  }

  async onRunComplete(contexts, results) {
    if (this.writeApi) {
      try {
        await this.writeApi.close();
        console.log('🚀 Resultados enviados a InfluxDB con éxito.');
      } catch (e) {
        console.error('❌ Error enviando a InfluxDB', e);
      }
    }
  }
}

module.exports = InfluxReporter;
