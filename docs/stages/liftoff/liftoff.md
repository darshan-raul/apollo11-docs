
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
      
- mission-timeline service **golang,fiber** wth its own **postgres** db:
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

- `docker compose up --watch`
- This command will ensure that all the components are up and if you change anything in the codebase of the microservices, their images are rebuild automatically

    