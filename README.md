Backend TicoAutos

Backend principal de TicoAutos. Este proyecto expone una API REST para manejar usuarios, autenticacion, vehiculos, imagenes y conversaciones entre compradores y propietarios.

Que hace este backend:
Registra usuarios normales y usuarios con Google
Inicia sesion y genera JWT
Valida correo y soporta verificacion en dos pasos
Crea, edita, lista y elimina vehiculos
Sube imagenes de vehiculos
Maneja preguntas, chats y conversaciones

Tecnologias usadas:
Node.js
Express
MongoDB
Mongoose
JWT
Multer


Instalar:
Node.js
MongoDB

Instalacion:
1. Entra a la carpeta `Backend_TicoAutos_V2`.
2. Ejecuta `npm install`.

Para desarrollo usa `npm run dev`.
Para ejecucion normal usa `npm start`.
Si todo esta correcto, la API queda disponible en `http://localhost:3000`.

Estructura general

`controllers/`: logica principal de cada modulo
`routes/`: rutas de la API
`models/`: esquemas de MongoDB
`middleware/`: autenticacion, uploads y validaciones
`uploads/`: imagenes de vehiculos
`utils/`: helpers del proyecto

Rutas principales
Usuarios:
`GET /api/users/validate-cedula`
`POST /api/users/register`
`POST /api/users/register-google`

Autenticacion:
`POST /api/auth/login`
`POST /api/auth/2fa/verify`
`POST /api/auth/google`
`GET /api/auth/verify-email`
`POST /api/auth/logout`
`GET /api/auth/me`

Vehiculos:
- `GET /api/vehicles`
- `GET /api/vehicles/mine`
- `GET /api/vehicles/:id`
- `POST /api/vehicles`
- `PUT /api/vehicles/:id`
- `DELETE /api/vehicles/:id`
- `PATCH /api/vehicles/:id/sold`
- `PATCH /api/vehicles/:id/status`

Chats y preguntas:
`GET /api/questions/chats`
`GET /api/questions/vehicle/:vehicleId/conversation`
`GET /api/questions/conversations/:conversationId/messages`
`POST /api/questions/vehicle/:vehicleId`
`POST /api/questions/:id/answer`

- `minPrice`
- `maxPrice`
- `page`
- `limit`
