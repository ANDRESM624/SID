const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const fs = require('fs');
const path = require('path');

// Obtener variables de entorno
const token = process.env.INFLUX_TOKEN;
const org = process.env.INFLUX_ORG;
const bucket = process.env.INFLUX_BUCKET;
const url = process.env.INFLUX_URL || 'http://localhost:8086';

if (!token || !org || !bucket) {
  console.error("Faltan variables de entorno para InfluxDB (INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET).");
  process.exit(1);
}

// Configurar el cliente
const client = new InfluxDB({ url, token });
const writeApi = client.getWriteApi(org, bucket, 'ns');

const reportPath = path.join(__dirname, '..', 'report.json');

try {
  // Leer y parsear el reporte de pytest
  const reportData = fs.readFileSync(reportPath, 'utf8');
  const report = JSON.parse(reportData);

  const summary = report.summary;
  
  // Variables a enviar (número de pruebas exitosas, fallidas, tiempo)
  const total = summary.total || 0;
  const passed = summary.passed || 0;
  const failed = summary.failed || 0;
  const duration = report.duration || 0;

  console.log(`Pruebas: ${total} | Pasaron: ${passed} | Fallaron: ${failed} | Duración: ${duration}s`);

  // Crear un punto de métrica (Point) en InfluxDB
  const point = new Point('test_results')
    .tag('project', 'SID')
    .tag('runner', 'github_actions')
    .intField('total', total)
    .intField('passed', passed)
    .intField('failed', failed)
    .floatField('duration', duration);

  writeApi.writePoint(point);

  // Cerrar el API para asegurar el envío
  writeApi.close().then(() => {
    console.log('Resultados enviados exitosamente a InfluxDB.');
  }).catch((e) => {
    console.error('Error al enviar los datos a InfluxDB', e);
  });

} catch (err) {
  console.error('Error leyendo el archivo report.json:', err.message);
  process.exit(1);
}
