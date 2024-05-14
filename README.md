# 🦖 Crackosaurus

Crackosaurus is the world's first open source password recovery platform. Powered by [hashcat](https://hashcat.net/hashcat/), Crackosaurus can recover almost any type of password hash with great speed and ease. Crackosaurus is a must have tool for any security team!

## 📦 Deployment

Crackosaurus is designed to be deployable anywhere. Find your favorite infrastructure below. If it's not there, PRs are open!

### ☁️ AWS CDK

AWS CDK is recommended to deploy on the cloud. Following is an overview of the infrastructure:

![Diagram](.github/aws/diagram.png)

Install the following dependencies:

- [Docker](https://www.docker.com/)
- [Node](https://nodejs.org/en)
    - [NPM](https://www.npmjs.com/)

For Docker, make sure that the deployment user is part of the `docker` group:

```
sudo usermod -aG docker YOUR_USERNAME
```

It is strongly recommended to make a [private fork](https://gist.github.com/0xjac/85097472043b697ab57ba1b1c7530274) of this repository. Make a branch `YOUR_ORG` and copy `apps/cdk/lib/cdk-stack.ts` to `apps/cdk/lib/YOUR_ORG-stack.ts` and update `apps/cdk/bin/cdk.ts` to point to your new stack. This will allow to tweak the infrastructure settings.

Deploy using the following commands:

```
npm install
cd apps/cdk
AWS_PROFILE=YOUR_PROFILE npm run cdk bootstrap
AWS_PROFILE=YOUR_PROFILE npm run cdk deploy
```

Setup the platform using:

```
http://LINK_TO_APP/setup
```

### 🐋 Docker

Docker is recommended to deploy locally. Currently, this is only intended for pre-production purposes.

Install the following dependencies:

- [Docker](https://www.docker.com/)
    - [Docker Compose](https://docs.docker.com/compose/)

Deploy using the following commands:

```
sudo docker-compose build
sudo docker-compose up
```

Setup the platform using:

```
http://localhost:8080/setup
```

## 🔨 Development

### 🔗 PR

Development of the app is done via [feature branches](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow) off of the `dev` branch. Make sure to have this configured before continuing.

### 🧩 Dependencies

Crackosaurus is a full TypeScript Monorepo. The following is required:

- [Node](https://nodejs.org/en)
    - [NPM](https://www.npmjs.com/)

The following is only necessary for deployment:

- [Docker](https://www.docker.com/)
    - [Docker Compose](https://docs.docker.com/compose/)

### 🎨 Format

Formatting is required before PR. This can easily be done on all the monorepo using:

```
npm install
npm run format
```

### 🖥️ Setup

[Prisma](https://www.prisma.io/) is the ORM used to handle the database. This can be setup and updated using following:

```
npm install
npm run migrate
```

### 👣 Run

A development version can be run using:

```
npm run dev
```

The admin account can be setup using:

http://localhost:5174/setup

The microservices can be found at:

- Web: http://localhost:5174/
- Backend: http://localhost:8080/
- Cluster: http://localhost:13337/
