# Crackosaurus

A password cracking platform.

## Development

### Init

```
npm run migrate
```

### Run

```
npm run dev
```

```
Web -> http://localhost:5174/
Backend -> http://localhost:8080/
Cluster -> http://localhost:13337/
```

Note: Visit http://localhost:5174/setup to configure instance.

### Format

```
npm run format
```

## Pre-production

```
sudo docker-compose build
sudo docker-compose up
```

Note: Containers may reset a couple times while database setup.

## Production

### Initial

Make sure Docker is running and your user has access to the docker group:

```
sudo usermod -aG docker YOUR_USERNAME
```

```
cd apps/cdk
npm run build
AWS_PROFILE=YOUR_PROFILE npm run cdk bootstrap
```

### Next

```
cd apps/cdk
npm run build
AWS_PROFILE=YOUR_PROFILE npm run cdk deploy
```
