# Backend TicoAutos

API REST para TicoAutos construida con Node.js, Express y MongoDB. Este backend maneja autenticacion, registro de usuarios, publicacion de vehiculos, carga de imagenes y mensajeria entre interesados y propietarios.

## Funcionalidades

- Registro local con validacion de cedula contra padron.
- Verificacion de correo electronico con SendGrid.
- Inicio de sesion tradicional con JWT y segundo factor por SMS con Twilio.
- Inicio y registro con Google.
- CRUD de vehiculos con carga de hasta 6 imagenes por publicacion.
- Listado publico de vehiculos con filtros y paginacion.
- Bandeja de chats y preguntas por vehiculo.

## Stack

- Node.js
- Express
- MongoDB con Mongoose
- JWT
- Multer
- SendGrid
- Twilio
- Google Identity

## Requisitos

- Node.js 18 o superior
- MongoDB accesible desde el proyecto
- Un servicio de padron disponible en `PADRON_API_URL`
- Credenciales validas si se desea usar:
  - SendGrid
  - Twilio
  - Google Sign-In

## Instalacion

```bash
npm install
```



## Scripts

```bash
npm run dev
npm start
```

- `npm run dev`: inicia el servidor con `nodemon`
- `npm start`: inicia el servidor con Node

## Ejecucion

El servidor inicia por defecto en:

```text
http://localhost:3000
```

Tambien expone archivos estaticos subidos en:

```text
/uploads
```

## Estructura del proyecto

```text
Backend_TicoAutos_V2/
|-- controllers/
|-- middleware/
|-- models/
|-- routes/
|-- uploads/
|-- utils/
|-- index.js
|-- package.json
`-- .env
```

## Endpoints principales

### Autenticacion

Base: `/api/auth`

- `POST /login`: login tradicional, envia codigo 2FA por SMS.
- `POST /2fa/verify`: valida el codigo SMS y devuelve el JWT final.
- `POST /google`: login con Google.
- `GET /verify-email`: activa la cuenta desde el enlace enviado por correo.
- `POST /logout`: cierra sesion de forma logica. Requiere token.
- `GET /me`: devuelve el usuario autenticado. Requiere token.

### Usuarios

Base: `/api/users`

- `GET /validate-cedula?cedula=#########`: valida la cedula en el padron.
- `POST /register`: registro local con correo, contrasena, telefono y cedula.
- `POST /register-google`: completa el registro usando Google y cedula.

### Vehiculos

Base: `/api/vehicles`

- `GET /`: lista vehiculos con filtros y paginacion.
- `GET /mine`: lista los vehiculos del usuario autenticado.
- `GET /:id`: detalle de un vehiculo.
- `POST /`: crea una publicacion con imagenes.
- `PUT /:id`: actualiza una publicacion.
- `DELETE /:id`: elimina una publicacion.
- `PATCH /:id/sold`: marca el vehiculo como vendido.
- `PATCH /:id/status`: cambia el estado entre `disponible` y `vendido`.

Filtros soportados en el listado:

- `brand`
- `model`
- `status`
- `minYear`
- `maxYear`
- `minPrice`
- `maxPrice`
- `page`
- `limit`

### Preguntas y chats

Base: `/api/questions`

- `GET /chats`: bandeja de conversaciones del usuario autenticado.
- `GET /vehicle/:vehicleId/conversation`: obtiene o prepara el chat asociado a un vehiculo.
- `GET /conversations/:conversationId/messages`: historial de mensajes de una conversacion.
- `POST /vehicle/:vehicleId`: crea una pregunta sobre un vehiculo.
- `POST /:id/answer`: responde una pregunta pendiente.

## Autenticacion

Las rutas protegidas esperan un header:

```http
Authorization: Bearer TU_JWT
```

## Carga de imagenes

- Campo esperado en formularios multipart: `images`
- Maximo de archivos: `6`
- Tamano maximo por archivo: `5 MB`
- Formatos permitidos:
  - JPG
  - JPEG
  - PNG
  - WEBP

Las imagenes se guardan en `uploads/vehicles`.

## Flujo de registro local

1. El frontend valida la cedula con `GET /api/users/validate-cedula`.
2. El backend registra al usuario en estado `Pendiente`.
3. Se envia un correo de verificacion.
4. El usuario abre el enlace de verificacion.
5. La cuenta pasa a estado `Activa`.
6. En el login tradicional se envia un codigo 2FA por SMS antes de entregar el JWT.

## Notas

- El proyecto no tiene pruebas automatizadas configuradas por ahora.
- El script `npm test` actualmente no esta implementado.
- Para registro local, el servicio de padron es obligatorio.
- Para login tradicional completo, Twilio debe estar configurado.
- Para verificacion de correo, SendGrid debe estar configurado.


**DIAGRAMA**
<img width="832" height="685" alt="Imagen diagrama" src="https://github.com/user-attachments/assets/7b2ee2e2-d849-4a7b-950e-1912c06244e9" />
