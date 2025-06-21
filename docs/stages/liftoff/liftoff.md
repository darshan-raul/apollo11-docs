
This is where it all begins!

- Although the main agenda of this tutorial is to understand how to levarage all the useful tools in the cloud native ecosystem, we will be needing practical components to work on to really understand how to actually benifit from them in our day to day activities.
- It could not be any hello world app as there was no scope to create microservices around it nor could it be a very sofisticated multi usecase app. So instead its a fun little app where we will have a lunar module orbiting the moon as one app and some applications on the ground as some others. The apps are very simple [atleast in the starting stages :D ] and no rocket science :P. Goes with the name of the project: Apollo11 
- The flow has been designed in such a way that we can easily leverage service mesh, logging, tracing, metrics and many more features we will be visiting along the way.

## Components

The architecture consists of following:

- lunar module itself **golang,fiber** with its own **postgres** db
    - will generate arbitary values [assuming the module rotates the moon every 6 hours] about the moon and send data to telemetry service at regular intervals. 
    - Get some commands from the command dispatcher and execute them

- telemetry service **python,fastapi** with its own **postgres** db
    - will get the data from lunar module and will store it in its db 
    - it will respond with its data when asked from mission dashboard

- mission dashboard service **gohtmx** will be a frontend service which will:
    - regularly polls for telemetry data from telemetry service and displays it
    - has some buttons to send command to the command dispatcher service discribed below
    - has a windows to show the next events scheduled grabbed from the mission-timeline service described below.
        - also has button to add new events there
      
- mission-timeline service **golang,fiber** wth its own **mongodb** db:
    - has some arbitary events to be launched on lunar module
    - responds with event data when called on /data
    - inserts new event in the db when called on /input

- command-dispatcher service **python,fastapi**:
    - relays the commands sent from mission dashboard to the lunar module

> You **donot** need to worry if you are not accustomed with any of the this languages or libraries. The code has been kept easy purposefully and you will not need to even look at it if all goes well but if you may have to, it will be easy to troubleshoot [use genai all the way]. For any one coming from a programming background, this will be right up your sleeve.

![apollo-11-lunar-architecture](<lunar-arch.png>)

# Running locally with docker

We will be skipping any local setup and directly setup everything in docker. You donot need to install any dependency like python,go



## Prereqs:

- ensure docker is installed

## Run the stack

- Clone the repo: `git clone https://github.com/darshan-raul/Apollo11.git`
- Go inside the repo folder `cd Apollo11`
- In stages folder, go to liftoff subfolder: `cd stages/liftoff`
- Run the docker compose up command `docker compose up --watch`
- This command will ensure that all the components are up and if you change anything in the codebase of the microservices, their images are rebuild automatically

## Check the application

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
