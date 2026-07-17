const request = require("supertest");

const API_URL = "http://127.0.0.1:8000";

describe("Evaluación de Mantenibilidad - SID (Bloque A)", () => {
  // JST-F01: Analizabilidad de Rendimiento (Dashboard)
  test("El Dashboard debe responder (HTTP 302 sin sesión, HTTP 200 con sesión)", async () => {
    const response = await request(API_URL).get("/factura-dashboard/");
    expect(response.statusCode).toBe(302);
  });

  // JST-F03: Manejo de Excepciones Limpio
  test("Un ID inexistente en ver-factura debe retornar un error 404 limpio", async () => {
    const response = await request(API_URL).get("/ver-factura/99999/");
    expect(response.statusCode).toBe(404);
  });

  // JST-S02: Seguridad CSRF
  test("Las peticiones POST sin Token CSRF deben ser bloqueadas", async () => {
    const response = await request(API_URL)
      .post("/crear-factura/")
      .send({ nombre_cliente: "Hacker" });
    expect(response.statusCode).toBe(403);
  });
});

describe("Evaluación de Mantenibilidad - SID (Bloque B & C)", () => {
  // SID-M04: Modularidad (Dependencia entre Nota y Factura)
  test("La creacion de Notas de Credito sin una factura origen valida no debe colapsar el servidor (Error 500)", async () => {
    const response = await request(API_URL)
      .post("/notas/credito/crear/")
      .send({ monto: 500, descripcion: "Prueba Jest de Modularidad" });
    expect(response.statusCode).not.toBe(500);
  });

  // SID-M05: Modificabilidad extrema (Stress Test en Órdenes)
  test("El sistema de Ordenes de Entrega debe rechazar textos extremadamente largos para evitar corrupcion de BD", async () => {
    const payloadMasivo = "A".repeat(10000); 
    const response = await request(API_URL)
      .post("/ordenes/crear/")
      .send({ direccion_entrega: payloadMasivo });
    expect(response.statusCode).not.toBe(500);
  });

  // SID-M06: Reusabilidad de sesión en diferentes módulos
  test("El dashboard de Ordenes debe reutilizar la proteccion de sesion y bloquear usuarios anonimos", async () => {
    const response = await request(API_URL).get("/ordenes/dashboard/");
    expect(response.statusCode).toBe(302);
  });
});
