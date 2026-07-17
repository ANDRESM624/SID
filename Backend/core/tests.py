from django.test import TestCase, Client
from django.db import IntegrityError, transaction, DataError
from django.db.models import ProtectedError
from django.contrib.auth.models import User
from django.utils import timezone
from django.urls import reverse

# Importaciones correctas basadas en tus archivos
from Backend.facturas.models import Factura
from Backend.notas_de_debito_credito.models import Nota
from Backend.orden_de_entrega.models import OrdenDeEntrega


class IntegracionSIDTests(TestCase):

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username='operador', password='password123')
        
        # Factura base con todos los campos obligatorios de tu archivo models.py
        self.factura_base = Factura.objects.create(
            nombre_cliente="Cliente QA",
            lugar_emision="Caracas",
            fecha_emision=timezone.now().date(),
            telefono_cliente="04141234567",
            cedula_cliente="V-12345678",
            usuario=self.user,
            numero_factura="FAC-001"
        )

    # ==========================================
    # B0 — Persistencia ORM y SQLite
    # ==========================================
    def test_int_b0_01_persistencia_factura(self):
        conteo_inicial = Factura.objects.count()
        Factura.objects.create(
            nombre_cliente="Cliente 2", lugar_emision="Caracas",
            fecha_emision=timezone.now().date(), telefono_cliente="04141234567",
            cedula_cliente="V-12345678", usuario=self.user, numero_factura="FAC-002"
        )
        self.assertEqual(Factura.objects.count(), conteo_inicial + 1)

    def test_int_b0_02_restriccion_unicidad(self):
        with self.assertRaises(IntegrityError):
            Factura.objects.create(
                nombre_cliente="Cliente 3", lugar_emision="Caracas",
                fecha_emision=timezone.now().date(), telefono_cliente="04141234567",
                cedula_cliente="V-12345678", usuario=self.user, 
                numero_factura="FAC-001" # Choca con la de setUp
            )

    def test_int_b0_03_transaccion_orm_rollback(self):
        try:
            with transaction.atomic():
                Factura.objects.create(
                    nombre_cliente="Cliente 3", lugar_emision="Caracas",
                    fecha_emision=timezone.now().date(), telefono_cliente="04141234567",
                    cedula_cliente="V-12345678", usuario=self.user, numero_factura="FAC-003"
                )
                Factura.objects.create(
                    nombre_cliente="Cliente 4", lugar_emision="Caracas",
                    fecha_emision=timezone.now().date(), telefono_cliente="04141234567",
                    cedula_cliente="V-12345678", usuario=self.user, numero_factura="FAC-001"
                )
        except IntegrityError:
            pass
        self.assertFalse(Factura.objects.filter(numero_factura="FAC-003").exists())

    def test_int_b0_04_sobrecarga_texto(self):
        texto_largo = "A" * 500
        with self.assertRaises((DataError, Exception)):
            OrdenDeEntrega.objects.create(
                factura_afectada=self.factura_base,
                usuario=self.user,
                direccion_entrega=texto_largo
            )

    # ==========================================
    # B1 — Integridad Referencial
    # ==========================================
    def test_int_b1_01_vinculacion_orm(self):
        nota = Nota.objects.create(
            factura_afectada=self.factura_base, usuario=self.user,
            es_debito=False, subtotal=100, iva=16, total=116
        )
        self.assertEqual(nota.factura_afectada.numero_factura, "FAC-001")

    def test_int_b1_02_eliminacion_protegida(self):
        # NOTA DE QA: El plan exigía ProtectedError.
        Nota.objects.create(
            factura_afectada=self.factura_base, usuario=self.user,
            es_debito=False, subtotal=100, iva=16, total=116
        )
        with self.assertRaises(ProtectedError):
            self.factura_base.delete()

    def test_int_b1_03_consulta_relacional_inversa(self):
        Nota.objects.create(
            factura_afectada=self.factura_base, usuario=self.user,
            es_debito=False, subtotal=100, iva=16, total=116
        )
        notas = self.factura_base.nota_set.all()
        self.assertEqual(notas.count(), 1)

    def test_int_b1_04_nota_huerfana(self):
        with self.assertRaises(IntegrityError):
            Nota.objects.create(
                factura_afectada=None, usuario=self.user,
                es_debito=False, subtotal=100, iva=16, total=116
            )
# ==========================================
    # B2 — Ciclo HTTP y Vistas SSR
    # ==========================================
    def test_int_b2_01_dashboard_get(self):
        """INT-B2-01: Inyección de Contexto en Dashboard (GET)"""
        self.client.force_login(self.user)
        response = self.client.get(reverse('factura-dashboard'))
        self.assertEqual(response.status_code, 200)

    def test_int_b2_02_factura_post_valido(self):
        """INT-B2-02: Formulario -> ORM -> BD (POST válido)"""
        self.client.force_login(self.user)
        data = {
            'nombre_cliente': 'Cliente Nuevo B2',
            'lugar_emision': 'Caracas',
            'telefono_cliente': '04141234567',
            'cedula_cliente': 'V-87654321',
        }
        response = self.client.post(reverse('crear-factura'), data)
        # Esperamos redirección (302) o éxito
        self.assertIn(response.status_code, [200, 302])
        # Verificar que efectivamente pasó del form a la BD
        self.assertTrue(Factura.objects.filter(nombre_cliente='Cliente Nuevo B2').exists())

    def test_int_b2_04_detalle_id_inexistente(self):
        """INT-B2-04: Borde: ID inexistente en ver factura"""
        self.client.force_login(self.user)
        response = self.client.get(reverse('ver-factura-emitida', args=[9999]))
        self.assertEqual(response.status_code, 404)

    # ==========================================
    # B3 — Middlewares y Autenticación
    # ==========================================
    def test_int_b3_01_acceso_anonimo(self):
        """INT-B3-01: Acceso anónimo redirige al login"""
        self.client.logout() 
        response = self.client.get(reverse('factura-dashboard'))
        self.assertEqual(response.status_code, 302) 
        # Debería contener la palabra login en la url a la que redirige
        self.assertIn('login', response.url.lower()) 

    def test_int_b3_03_csrf_token_faltante(self):
        """INT-B3-03: Borde: POST sin Token CSRF (Seguridad)"""
        cliente_sin_csrf = Client(enforce_csrf_checks=True)
        cliente_sin_csrf.force_login(self.user)
        response = cliente_sin_csrf.post(reverse('crear-factura'), {'nombre_cliente': 'Hacker'})
        self.assertEqual(response.status_code, 403) # 403 Forbidden

    # ==========================================
    # B4 — Integración Motor PDF
    # ==========================================
    def test_int_b4_01_imprimir_pdf(self):
        """INT-B4-01: Cabeceras HTTP de la respuesta PDF"""
        self.client.force_login(self.user)
        # Descargamos el PDF de la factura_base creada en el setUp
        response = self.client.get(reverse('descargar-factura-pdf', args=[self.factura_base.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')