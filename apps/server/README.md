# Server

## Getting Started

### Prisma

```
npx prisma migrate dev --name init
```

### SSL

```
openssl genrsa -out dev.key 2048
openssl req -new -key dev.key -out dev.csr
openssl x509 -req -days 365 -in dev.csr -signkey dev.key -out dev.crt
```
