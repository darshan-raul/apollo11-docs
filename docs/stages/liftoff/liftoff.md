This is where it all begins!

- Although the main agenda of this tutorial is to understand how to levarage all the useful tools in the cloud native ecosystem, we will be needing practical components to work on to really understand how to actually benifit from them in our day to day activities.
- It could not be any hello world app as there was no scope to create microservices around it nor could it be a very sofisticated multi usecase app. So instead its a fun little app where we will have a lunar module orbiting the moon as one app and some applications on the ground as some others. The apps are very simple [atleast in the starting stages :D ] and no rocket science involved :P. Goes with the name of the project: Apollo11 
- The flow has been designed in such a way that we can easily leverage service mesh, logging, tracing, metrics and many more features we will be visiting along the way.

## Components

The architecture consists of following:

>TODO

> You **donot** need to worry if you are not accustomed with any of the this languages or libraries. The code has been kept easy purposefully and you will not need to even look at it if all goes well but if you may have to, it will be easy to troubleshoot [use genai all the way to understand the confusing bits]. For any one coming from a programming background, this will be right up your sleeve.



# Running locally with docker compose

> We will be skipping any local setup and directly setup everything in docker. **You donot need to install any dependency like python,go,npm**

## Prereqs:

- ensure docker and docker-compose are installed [They mostly come bundled up if you follow the official docs]

## Run Compose

- Clone the repo in a partiuclar projects folder: 
    ```
        git clone https://github.com/darshan-raul/Apollo11.git
    ```
- Go inside the repo folder `cd Apollo11`
- In stages folder, go to liftoff subfolder: `cd stages/liftoff`
- Run the docker compose up command `docker compose up --watch`
- This command will ensure that all the components are up and if you change anything in the codebase of the microservices, their images are rebuild automatically

## Check the services

- You can check `docker ps` and confirm that 8 containers are running

```
CONTAINER ID   IMAGE                        COMMAND                  CREATED              STATUS              PORTS                                             NAMES
c571c2d75cf3   liftoff-dashboard-app        "./dashboard"            About a minute ago   Up About a minute   0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp       liftoff-dashboard-app-1
326f73981ade   liftoff-command-dispatcher   "uvicorn main:app --…"   About a minute ago   Up About a minute   0.0.0.0:9000->8000/tcp, [::]:9000->8000/tcp       liftoff-command-dispatcher-1
7f5128409e60   liftoff-timeline-app         "./timeline"             About a minute ago   Up About a minute   0.0.0.0:8081->8080/tcp, [::]:8081->8080/tcp       liftoff-timeline-app-1
39eea79a30ed   liftoff-lunar-app            "./lunar-module"         About a minute ago   Up About a minute   0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp       liftoff-lunar-app-1
27452f4c3ca2   liftoff-telemetry-app        "uvicorn main:app --…"   About a minute ago   Up About a minute   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp       liftoff-telemetry-app-1
c901f589e718   mongo:7.0                    "docker-entrypoint.s…"   About a minute ago   Up About a minute   0.0.0.0:27017->27017/tcp, [::]:27017->27017/tcp   liftoff-timeline-mongodb-1
77f8d47659b2   postgres:15-alpine           "docker-entrypoint.s…"   About a minute ago   Up About a minute   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp       liftoff-lunar-postgres-1
ab00f101892b   postgres:15-alpine           "docker-entrypoint.s…"   About a minute ago   Up About a minute   0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp       liftoff-telemetry-postgres-1

```

- Post that you can go to the browser and enter: `http://localhost:3000` and you should be able to view the dashboard!

## Docker compose Basics

Docker Compose is a tool for defining and running multi-container Docker applications. With Compose, you use a YAML file to configure your application's services, networks, and volumes, then with a single command you can create and start all the services from your configuration.

### Key Concepts
- **Service**: A service defines how a container for a specific image should run. In Compose, you define each service (e.g., web, db) in the YAML file.
- **Image**: The Docker image to use for the service.
- **Container**: A running instance of an image.
- **Volume**: Persistent data storage that is independent of the container lifecycle.
- **Network**: Allows communication between containers.

**Sample: Single Service Compose File (Timeline Service Example)**
Below is a minimal example of a `docker-compose.yaml` file for the `timeline-app` and its MongoDB database, based on your actual configuration. Each part is explained in comments:

```yaml
version: '3.8'  # Specify the Compose file format version

services:
  timeline-app:  # Name of the timeline service
    build:
      context: ../../code/timeline  # Path to the build context (source code)
      dockerfile: Dockerfile        # Dockerfile to use for building the image
    ports:
      - "8081:8080"  # Map host port 8081 to container port 8080
    environment:
      - MONGODB_URI=mongodb://admin:password@timeline-mongodb:27017  # Connection string for MongoDB
      - MONGO_USERNAME=admin
      - MONGO_PASSWORD=password
      - MONGO_HOST=timeline-mongodb
      - MONGO_PORT=27017
    depends_on:
      - timeline-mongodb  # Ensure MongoDB starts before the app
    networks:
      - apollo-network    # Connect to the custom network

  timeline-mongodb:  # MongoDB service for timeline
    image: bitnami/mongodb:latest  # Use the Bitnami MongoDB image
    ports:
      - "27017:27017"  # Expose MongoDB port
    environment:
      - MONGODB_ROOT_USER=admin
      - MONGODB_ROOT_PASSWORD=password
      - MONGO_DATABASE=timeline
    volumes:
      - type: volume
        source: timeline-mongodb-data
        target: /bitnami/mongodb  # Persist database data
    networks:
      - apollo-network

volumes:
  timeline-mongodb-data:  # Named volume for MongoDB data

networks:
  apollo-network:  # Custom bridge network for service communication
    driver: bridge
```

**Explanation:**

- `version`: Specifies the version of the Compose file format.
- `services`: Top-level key defining all the services (containers) to run.
- `timeline-app`: The main timeline service, built from your source code.
- `build`: Specifies how to build the Docker image for the service.
- `ports`: Maps ports from the host to the container (`host:container`).
- `environment`: Sets environment variables inside the container (e.g., database connection info).
- `depends_on`: Ensures the database starts before the app.
- `timeline-mongodb`: The MongoDB service for the timeline app.
- `image`: The Docker image to use for MongoDB.
- `volumes`: Mounts a named volume for persistent database storage.
- `networks`: Connects services to a custom Docker network for internal communication.

This structure can be extended to add more services, networks, and volumes as your application grows.

## Advanced Compose features

Docker Compose provides several advanced features that make development and management of multi-container applications easier and more efficient. Here's a detailed explanation of some key features used in our configuration:

### 1. Build on Demand
The `build` section allows you to specify how Docker should build the image for your service. Instead of always using a pre-built image, Compose can build the image from your source code whenever you run `docker compose up`.

```yaml
build:
  context: ../../code/lunar         # Path to the directory containing the Dockerfile and source code
  dockerfile: Dockerfile           # Name of the Dockerfile to use
```
- **context**: The directory sent to the Docker daemon as the build context. All files in this directory are accessible during the build.
- **dockerfile**: (Optional) The name of the Dockerfile (if not the default `Dockerfile`).

This ensures your service always uses the latest code and configuration when you start or rebuild your stack.

### 2. Active Develop Files (Live Reload)
The `develop` section with `watch` enables live reloading or rebuilding of your service when files change during development. This is especially useful for rapid iteration.

```yaml
develop:
  watch:
    - path: ../../code/lunar       # Path to watch for changes
      action: rebuild              # Action to take (rebuild the image) when changes are detected
```
- **path**: The directory or file to watch for changes.
- **action**: What to do when a change is detected (e.g., `rebuild` the image).

This feature allows you to see your code changes reflected in the running containers without manual intervention.

### 3. Volumes for Mounting
Volumes are used to persist data or to share files between your host and containers. There are two main types:
- **Named volumes**: Managed by Docker, useful for persisting database data.
- **Bind mounts**: Directly map a host path to a container path, useful for sharing code during development.

Example:
```yaml
volumes:
  lunar-postgres-data:
    name: "lunar-postgres"           # Named volume for PostgreSQL data
  telemetry-postgres-data:
    name: "telemetry-postgres"
  timeline-mongodb-data:
    name: "timeline-mongodb"
```
- These named volumes ensure that your database data is not lost when containers are recreated or removed.

You can also use bind mounts in a service definition:
```yaml
volumes:
  - ./app:/app                       # Mounts local ./app directory to /app in the container
```

### 4. Custom Bridge Network for All Services
By default, Docker Compose creates a network for your application. Defining a custom network gives you more control and allows all your services to communicate securely and efficiently.

Example:
```yaml
networks:
  apollo-network:
    driver: bridge                   # Use the bridge driver for isolated networking
```
- **driver: bridge**: The default network driver, suitable for most multi-container setups. All services attached to this network can communicate using their service names as hostnames.

This setup ensures that your services are isolated from other containers on your system, but can freely communicate with each other.

---
