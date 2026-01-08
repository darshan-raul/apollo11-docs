!!! note
    This is where it all begins!

    - Although the main agenda of this tutorial is to understand how to levarage all the useful tools in the cloud native ecosystem, we will be needing practical components to work on to really understand how to actually benifit from them in our day to day activities.
    - It could not be any hello world app as there was no scope to create microservices around it nor could it be a very sofisticated multi usecase app. So instead its a fun app where we will build a learning portal to understand this tutorial itself!
    - The flow has been designed in such a way that we can easily leverage service mesh, logging, tracing, metrics and many more features we will be visiting along the way.

## Components

The architecture consists of following:

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Core API** | **FastAPI** (Python) | Main backend service handling primary logic and data management. |
| **Quiz Service** | **Go** | Microservice dedicated to managing quizzes and assessments. |
| **Portal** | **React** & **Vite** | Frontend serving as the main entry point for users. |
| **Admin Dashboard** | **Streamlit** (Python) | Dashboard for administrators to monitor and manage the platform. |
| **Infrastructure** | **PostgreSQL** & **Keycloak** | Database and authentication services. |

> You **donot** need to worry if you are not accustomed with any of the this languages or libraries. You just need to understand the flow and the components. Its about leveraging the tools with these components.


# Running locally with docker compose

> We will be skipping any local setup and directly setup everything in docker. **You donot need to install any dependency like python,go,npm**


## Prereqs:

### Environment Setup

To get started with the Cloud Native ecosystem, we need a few core tools: `docker`, `kubectl`, and `k3d`. We have provided a script to automate the installation of these tools natively on Linux.

**Steps to Setup:**

1.  **Run the Preparation Script**:
    From the root of the `Apollo11` repository, execute the following:

    ```bash
    chmod +x prep.sh
    ./prep.sh
    ```

    This script will install:
    - **kubectl**: The Kubernetes command-line tool.
    - **k3d**: To run local Kubernetes clusters in Docker.
    - **docker**: The container engine (if not already present).

2.  **Verify Setup**:
    After the script finishes, verify the tools are available in your path:

    ```bash
    docker version
    kubectl version --client
    k3d version
    ```

## Run Compose

- Clone the repo in a partiuclar projects folder: 
    ```
        git clone https://github.com/darshan-raul/Apollo11.git
    ```
- Go inside the repo folder `cd Apollo11`
- Go to the code subfolder: `cd code`
- You will see the `compose.yml` file, thats our docker compose file!
- Run the docker compose up command `docker compose up --build`
- This command will ensure that all the components are up and running.

## Check the services

- The time needed for all the services to be up and running will depend on your system specs and network speed.
- Your indication that everything is up and running is when you see the following output: 

![alt text](dockercomposeready.png)

- You can check `docker ps` and confirm that 6 containers are running

```
❯ docker ps
CONTAINER ID   IMAGE                              COMMAND                  CREATED              STATUS              PORTS                                                   NAMES
4da88db2d256   apollo11-portal                    "/docker-entrypoint.…"   About a minute ago   Up About a minute   0.0.0.0:3000->80/tcp, [::]:3000->80/tcp                 apollo11-portal-1
b86c6bca5e91   apollo11-admin-dashboard           "streamlit run app.p…"   About a minute ago   Up About a minute   0.0.0.0:8501->8501/tcp, [::]:8501->8501/tcp             apollo11-admin-dashboard-1
e200792e8222   apollo11-core-api                  "uvicorn app.main:ap…"   About a minute ago   Up About a minute   0.0.0.0:8087->8000/tcp, [::]:8087->8000/tcp             apollo11-core-api-1
fc157ee7a7d8   apollo11-quiz-service              "/quiz-service"          About a minute ago   Up About a minute   0.0.0.0:8082->8080/tcp, [::]:8082->8080/tcp             apollo11-quiz-service-1
86d88a172dd9   quay.io/keycloak/keycloak:23.0.6   "/opt/keycloak/bin/k…"   About a minute ago   Up About a minute   8443/tcp, 0.0.0.0:8081->8080/tcp, [::]:8081->8080/tcp   apollo11-keycloak-1
0960ca8b6b05   postgres:15-alpine                 "docker-entrypoint.s…"   About a minute ago   Up About a minute   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp             apollo11-postgres-1


```

- Post that you can go to the browser and enter: `http://localhost:3000` and you should be able to view the dashboard!

![apollo11-landing](apollo11-landing.png)

- Press Start Mission button and you will be directed to the next keycloak login page!

![keycloak-login](keycloak-login.png)

- Enter the username and password as `admin` and `admin` and click login

- You will be directed to the dashboard!
![dashboard](dashboard.png)


--- 

# Dockerfile Basics

A Dockerfile is a text document that contains all the commands a user could call on the command line to assemble an image. It defines the environment inside your container.

## Key Concepts

Here are the most common instructions you'll see in our Dockerfiles:

- **FROM**: Initializes a new build stage and sets the Base Image for subsequent instructions.
- **WORKDIR**: Sets the working directory for any RUN, CMD, ENTRYPOINT, COPY and ADD instructions that follow.
- **COPY**: Copies new files or directories from `<src>` and adds them to the filesystem of the container at the path `<dest>`.
- **RUN**: Executes any commands in a new layer on top of the current image and commits the results.
- **CMD**: Provides defaults for an executing container. There can only be one CMD instruction in a Dockerfile.
- **EXPOSE**: Informs Docker that the container listens on the specified network ports at runtime.
- **ENV**: Sets the environment variable `<key>` to the value `<value>`.
- **ARG**: Defines a variable that users can pass at build-time to the builder with the `docker build` command.

## Examples in our app

Let's look at how we apply these in Apollo 11.

### 1. Python Services (Core API)

The Core API (`code/core-api/Dockerfile`) uses a standard Python setup.

```dockerfile
# Start from a lightweight Python image
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY app/ ./app/

# Command to run the application using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Features Leveraged:**

- **Layer Caching**: We copy `requirements.txt` and install dependencies *before* copying the app code. This means if we change our code but not our dependencies, Docker doesn't need to reinstall pip packages, speeding up builds significantly.

### 2. Admin Dashboard

The Admin Dashboard (`code/admin-dashboard/Dockerfile`) follows a similar pattern for Streamlit.

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

---

# Multistage Builds

One of the most powerful features of Docker is multistage builds. They allow you to use multiple `FROM` instructions in a single Dockerfile. Each instruction starts a new stage of the build. You can copy artifacts from one stage to another, leaving behind everything you don't need in the final image.

**Why use them?**

- **Smaller Image Sizes**: You discard build tools and intermediate files.
- **Security**: Your production image doesn't contain source code or compilers, only the compiled binary or static assets.

## Examples in Apollo 11

### 1. Go Microservice (Quiz Service)

Our Quiz Service (`code/quiz-service/Dockerfile`) shows an extreme example of optimization using the `scratch` image.

```dockerfile
# Stage 1: Builder
# We use the official Go image to compile our code
FROM golang:1.22 AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN go mod tidy

# Build the binary. CGO_ENABLED=0 is crucial for static linking.
RUN CGO_ENABLED=0 GOOS=linux go build -o quiz-service cmd/server/main.go

# Stage 2: Final
# We start from 'scratch' - an empty image!
FROM scratch

# Copy only the compiled binary from the builder stage
COPY --from=builder /app/quiz-service /quiz-service

EXPOSE 8080

CMD ["/quiz-service"]
```

**Flow:**

1.  **Builder Stage**: Has all the heavy Go compilers and tools. Compiles the code.
2.  **Final Stage**: Starts empty. We copy *only* the binary. The resulting image is tiny (just a few MBs) and secure.

### 2. React Frontend (Portal)

The Portal (`code/portal/Dockerfile`) needs Node.js to build, but only Nginx to run.

```dockerfile
# Stage 1: Build
FROM node:20-alpine as build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Build arguments for Vite environment variables
ARG VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Generates static files in /app/dist
RUN npm run build

# Stage 2: Serve
# We use Nginx to serve the static files
FROM nginx:alpine
# Copy the build output from the previous stage
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Flow:**

1.  **Build Stage**: Uses Node.js to install npm packages and run the build script. This creates static HTML/CSS/JS files.
2.  **Serve Stage**: Uses Nginx (a web server). We copy the static files to Nginx's html folder. The heavy `node_modules` are left behind!

---

# Docker Compose Basics

Docker Compose is a tool for defining and running multi-container Docker applications. With Compose, you use a YAML file to configure your application's services, networks, and volumes, then with a single command you can create and start all the services from your configuration.

## Key Concepts

- **Service**: A service defines how a container for a specific image should run. In Compose, you define each service (e.g., `core-api`, `postgres`) in the YAML file.
- **Image**: The Docker image to use for the service. Can be pulled from a registry (like `postgres:15-alpine`) or built from source code.
- **Container**: A running instance of an image.
- **Volume**: Persistent data storage that is independent of the container lifecycle.
- **Network**: Allows communication between containers using service names as hostnames.

## Understanding Our Apollo11 Compose File

Let's break down our `compose.yml` file step by step. We'll start with a simplified example and then explore the complete configuration.

### Minimal Example: Database Service

Here's the PostgreSQL database service from our configuration:

```yaml
services:
  postgres:
    image: postgres:15-alpine                    # Use official PostgreSQL 15 Alpine image
    environment:
      POSTGRES_USER: postgres                    # Database username
      POSTGRES_PASSWORD: postgres                # Database password
      POSTGRES_DB: apollo11                      # Default database name
    ports:
      - "5432:5432"                              # Expose port 5432 to host
    volumes:
      - ./database/migrations:/docker-entrypoint-initdb.d  # Run SQL migrations on startup
      - postgres-data:/var/lib/postgresql/data             # Persist database data
    networks:
      - apollo-net                               # Connect to custom network

volumes:
  postgres-data:
    name: apollo11-postgres-data                 # Named volume for data persistence

networks:
  apollo-net:
    driver: bridge                               # Custom bridge network
```

**Key Points:**

- **Image**: We use the lightweight Alpine-based PostgreSQL image
- **Environment Variables**: Configure database credentials and initial database
- **Ports**: Map container port 5432 to host port 5432 (format: `host:container`)
- **Volumes**: 
  - Bind mount for initialization scripts (runs `.sql` files on first startup)
  - Named volume for persistent data storage (survives container restarts/deletions)
- **Networks**: All services connect to `apollo-net` for inter-service communication

### Building Custom Services

Our application services (Core API, Quiz Service, Portal, Admin Dashboard) are built from source code rather than using pre-built images:

```yaml
services:
  core-api:
    build: ./core-api                            # Build from Dockerfile in this directory
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/apollo11
      KEYCLOAK_URL: http://keycloak:8080
      QUIZ_SERVICE_URL: http://quiz-service:8080
      REALM: apollo11
      CLIENT_ID: apollo11-portal
    ports:
      - "8087:8000"                              # Map host 8087 to container 8000
    depends_on:
      - postgres                                 # Wait for postgres to start first
      - keycloak
    networks:
      - apollo-net
```

**Key Points:**

- **Build**: Docker Compose will look for a `Dockerfile` in the `./core-api` directory and build the image
- **Environment Variables**: Pass configuration to the application (database URLs, service endpoints, etc.)
- **depends_on**: Ensures dependencies start before this service (note: doesn't wait for them to be "ready", just started)
- **Service Discovery**: Notice how we use service names (`postgres`, `keycloak`, `quiz-service`) as hostnames in URLs - this is Docker's built-in DNS!

### Build Arguments for Frontend

The Portal service uses build arguments to inject configuration at build time:

```yaml
services:
  portal:
    build:
      context: ./portal
      args:
        VITE_KEYCLOAK_URL: http://localhost:8081/realms/apollo11
        VITE_API_URL: http://localhost:8087
    ports:
      - "3000:80"
    networks:
      - apollo-net
    depends_on:
      - core-api
```

**Key Points:**

- **Build Args**: These are passed to the Dockerfile during build and are typically used for frontend environment variables that get baked into the static build
- **Context**: Specifies the build context directory

### Authentication with Keycloak

Keycloak requires special configuration for importing realm settings and database setup:

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:23.0.6
    command: start-dev --import-realm           # Start in dev mode and import realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/apollo11
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: postgres
      KC_DB_SCHEMA: keycloak                    # Use separate schema in same database
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    volumes:
      - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm.json
    ports:
      - "8081:8080"
    restart: always                             # Always restart if container stops
    depends_on:
      - postgres
    networks:
      - apollo-net
```

**Key Points:**

- **Command Override**: The `command` field overrides the default container command
- **Realm Import**: The volume mount provides a realm configuration file that Keycloak imports on startup
- **Restart Policy**: `restart: always` ensures Keycloak restarts automatically if it crashes
- **Schema Separation**: Keycloak uses its own schema (`keycloak`) within the shared PostgreSQL database

## Complete Architecture Overview

Our complete setup includes:

| Service | Type | Port | Purpose |
|---------|------|------|---------|
| **postgres** | Database | 5432 | Shared PostgreSQL database for all services |
| **keycloak** | Auth | 8081 | Identity and access management (SSO/OIDC) |
| **core-api** | Backend | 8087 | Main FastAPI backend service |
| **quiz-service** | Backend | 8082 | Go-based quiz management microservice |
| **portal** | Frontend | 3000 | React user interface |
| **admin-dashboard** | Frontend | 8501 | Streamlit admin interface |

All services communicate through the `apollo-net` bridge network, allowing them to reach each other using service names as hostnames.

---

# Advanced Docker Compose Features

Now that we understand the basics, let's explore the advanced features that make our development workflow smooth and production-ready.

## 1. Named Volumes for Data Persistence

**Why it matters:** Without volumes, all data in a container is lost when the container is removed. Named volumes provide persistent storage managed by Docker.

```yaml
services:
  postgres:
    volumes:
      - postgres-data:/var/lib/postgresql/data  # Named volume

volumes:
  postgres-data:
    name: apollo11-postgres-data                # Custom name for easier identification
```

**How it works:**
- Docker creates and manages the volume in `/var/lib/docker/volumes/`
- Data persists even if you run `docker compose down`
- To completely remove data, you need `docker compose down -v` (removes volumes)
- You can inspect volumes with `docker volume ls` and `docker volume inspect apollo11-postgres-data`

**Bind Mounts vs Named Volumes:**
```yaml
volumes:
  - ./database/migrations:/docker-entrypoint-initdb.d  # Bind mount (host path)
  - postgres-data:/var/lib/postgresql/data             # Named volume (Docker-managed)
```
- **Bind mounts**: Direct mapping to host filesystem, useful for code and config files
- **Named volumes**: Docker-managed, better for database data and production use

## 2. Multi-Stage Builds and Build Context

Our services use Dockerfiles with build contexts:

```yaml
services:
  core-api:
    build: ./core-api                           # Simple: just the directory
  
  portal:
    build:
      context: ./portal                         # Build context directory
      args:                                     # Build-time arguments
        VITE_KEYCLOAK_URL: http://localhost:8081/realms/apollo11
        VITE_API_URL: http://localhost:8087
```

**Build Context**: All files in the context directory are sent to Docker daemon. Keep contexts small for faster builds!

**Build Arguments**: Passed to Dockerfile via `ARG` instruction:
```dockerfile
# In Dockerfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
```

## 3. Service Dependencies and Startup Order

```yaml
services:
  core-api:
    depends_on:
      - postgres
      - keycloak
```

**Important Limitation**: `depends_on` only controls startup order, NOT readiness!
- Docker starts `postgres` and `keycloak` first
- Then starts `core-api`
- But `core-api` might start before PostgreSQL is ready to accept connections

**Best Practice**: Your application should implement retry logic or health checks to handle this.

## 4. Environment Variables and Configuration

Three ways to pass environment variables:

```yaml
services:
  core-api:
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/apollo11  # Direct
      KEYCLOAK_URL: http://keycloak:8080
```

**Service Discovery**: Notice `postgres:5432` and `keycloak:8080` - we use service names as hostnames! Docker's internal DNS resolves these automatically within the `apollo-net` network.

## 5. Port Mapping Strategies

```yaml
ports:
  - "8087:8000"    # Host port 8087 → Container port 8000
  - "3000:80"      # Host port 3000 → Container port 80
  - "5432:5432"    # Same port on both sides
```

**Why different ports?**
- Avoid conflicts on host machine (e.g., if you already have something on port 8000)
- Internal services use standard ports (8000, 80, 5432)
- External access uses custom ports (8087, 3000, 5432)

## 6. Custom Bridge Networks

```yaml
networks:
  apollo-net:
    driver: bridge
```

**Benefits:**
- **Isolation**: Services on this network can't be accessed by other Docker containers
- **DNS**: Automatic service name resolution (e.g., `ping postgres` works from any container)
- **Security**: Services only expose ports explicitly mapped to host

**How services communicate:**
- `core-api` → `postgres`: Uses `postgres:5432` (internal network, no host port needed)
- Your browser → `portal`: Uses `localhost:3000` (mapped to host)

## 7. Restart Policies

```yaml
services:
  keycloak:
    restart: always
```

**Options:**
- `no`: Never restart (default)
- `always`: Always restart, even after host reboot
- `on-failure`: Only restart if container exits with error
- `unless-stopped`: Always restart unless explicitly stopped

**Use case**: Keycloak uses `always` because it's critical for authentication and should recover from crashes automatically.

## 8. Volume Mounts for Initialization

```yaml
services:
  postgres:
    volumes:
      - ./database/migrations:/docker-entrypoint-initdb.d
  
  keycloak:
    volumes:
      - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm.json
```

**PostgreSQL Init**: Any `.sql` or `.sh` files in `/docker-entrypoint-initdb.d` run on first startup (when database is empty)

**Keycloak Realm Import**: The `--import-realm` command flag tells Keycloak to import the realm configuration from the mounted JSON file

---

## Quick Reference Commands

```bash
# Start all services (build if needed)
docker compose up --build

# Start in background (detached mode)
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f core-api

# Stop all services (keeps volumes)
docker compose down

# Stop and remove volumes (deletes data!)
docker compose down -v

# Rebuild specific service
docker compose build core-api

# Restart specific service
docker compose restart keycloak

# View running containers
docker compose ps

# Execute command in running container
docker compose exec postgres psql -U postgres -d apollo11
```

---
