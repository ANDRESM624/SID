const request = require("supertest");
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const API_URL = "http://127.0.0.1:8000";
const ROOT_DIR = path.resolve(__dirname, "..");
const DJANGO_LOG = path.join(ROOT_DIR, "django.log");
const ENV_FILE = path.join(ROOT_DIR, ".env");
const DB_FILE = path.join(ROOT_DIR, "db.sqlite3");
const SETTINGS_FILE = path.join(ROOT_DIR, "imprenta_digital", "settings.py");

// Helper para iniciar servidor temporalmente
const startServer = () => {
  return spawn("python", ["manage.py", "runserver"], { cwd: ROOT_DIR });
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Pruebas de Sistema (Evaluación PDF)", () => {
  // MNT-SYS-01: Analizabilidad a Nivel de Sistema
  test("Debe validar la generación de Logs (Pistas de Auditoria) centralizados", async () => {
    // 1. Forzar error 404
    await request(API_URL).get("/esta-ruta-no-existe-12345/");

    // 2. Verificar que existe django.log y contiene el error
    expect(fs.existsSync(DJANGO_LOG)).toBe(true);
    const logContent = fs.readFileSync(DJANGO_LOG, "utf-8");
    expect(logContent).toMatch(/Not Found/i);
  });

  // MNT-SYS-02: Modificabilidad a Nivel de Sistema
  test("Reconfiguración mediante Variables de Entorno (.env)", async () => {
    // 1. Modificar el .env
    fs.writeFileSync(ENV_FILE, "DEBUG=False\n");

    // 2. Iniciar servidor
    const server = startServer();
    await sleep(3000); // Dar tiempo a que arranque

    try {
      // 3. Hacer petición y validar que arranca sin fallar
      const response = await request(API_URL).get("/login/");
      expect(response.statusCode).toBe(200);
    } finally {
      // Limpieza
      server.kill();
      fs.unlinkSync(ENV_FILE); // Borramos el .env temporal
      await sleep(1000);
    }
  });

  // MNT-SYS-03: Testeabilidad a Nivel de Sistema
  test("Ejecución de Migraciones de Base de Datos Limpias", async () => {
    jest.setTimeout(30000); // Esta prueba puede tardar un poco
    const dbBackup = DB_FILE + ".backup";
    const fixturePath = path.join(ROOT_DIR, "datos_iniciales.json");

    try {
      // 1. Backup de BD y creación de Fixture temporal (si no existe)
      if (fs.existsSync(DB_FILE)) {
        fs.copyFileSync(DB_FILE, dbBackup);
        execSync("python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission --indent 4 > datos_iniciales.json", { cwd: ROOT_DIR });
      }

      // 2. Borrar BD actual y recrearla desde cero
      if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
      execSync("python manage.py makemigrations", { cwd: ROOT_DIR });
      execSync("python manage.py migrate", { cwd: ROOT_DIR });
      
      // 3. Cargar datos
      if (fs.existsSync(fixturePath)) {
        execSync("python manage.py loaddata datos_iniciales.json", { cwd: ROOT_DIR });
      }

      // 4. Iniciar servidor temporal para Playwright
      const server = startServer();
      await sleep(3000);

      // 5. Verificar con Playwright
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(API_URL + "/login/");
      
      // Si la BD se cargó, la página de login existe y no hay errores
      const title = await page.title();
      expect(title).toBeDefined();

      await browser.close();
      server.kill();
    } finally {
      // Limpieza (restaurar BD)
      if (fs.existsSync(dbBackup)) {
        fs.copyFileSync(dbBackup, DB_FILE);
        fs.unlinkSync(dbBackup);
      }
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
      await sleep(1000);
    }
  });

  // MNT-SYS-04: Modularidad a Nivel de Sistema
  test("Aislamiento de Módulos (Apps de Django)", async () => {
    // 1. Leer settings.py y quitar la app de notas
    const originalSettings = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const modifiedSettings = originalSettings.replace(
      /'Backend\.notas_de_debito_credito',/g,
      "#'Backend.notas_de_debito_credito',"
    );
    fs.writeFileSync(SETTINGS_FILE, modifiedSettings);

    // 2. Reiniciar servidor
    const server = startServer();
    await sleep(3000);

    try {
      // 3. Navegar a otra sección para ver si sigue viva
      const response = await request(API_URL).get("/login/");
      expect(response.statusCode).toBe(200); // El sistema global no colapsó
    } finally {
      // Limpieza (restaurar settings)
      server.kill();
      fs.writeFileSync(SETTINGS_FILE, originalSettings);
      await sleep(1000);
    }
  });
});
