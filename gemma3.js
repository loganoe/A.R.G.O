const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const http = require("http");
var espIp = "http://192.168.68.166";
const app = express();
const PORT = 3001;
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const MAX_CONTEXT_LENGTH = 4; 
const conversationContext = new Map(); // Store context per connection
var cpos = [undefined, undefined, undefined]; // current position of the arm
const { atan2, sqrt, pow, acos, PI } = Math

// fixed arm segment lengths
const L1 = 220 // length from shoulder to elbow
const L2 = 220 // length from elbow to wrist

// helper to convert radians to degrees
const toDeg = rad => rad * (180 / PI)

function inverseKinematics(target) {
  const { x, y, z } = target

  // calculate base angle (rotation about z axis)
  const baseAngle = toDeg(atan2(y, x))

  // convert target to base plane (2D projection)
  const r = sqrt(x * x + y * y)
  const dz = z

  const dist = sqrt(pow(r, 2) + pow(dz, 2))

  // check if target is reachable
  if (dist > L1 + L2) {
    throw new Error('target is out of reach')
  }

  // use cosine law to find elbow angle
  const angleA = acos((pow(L1, 2) + pow(L2, 2) - pow(dist, 2)) / (2 * L1 * L2))
  const elbowAngle = 180 - toDeg(angleA)

  // angle between L1 and the line from shoulder to target
  const angleB = acos((pow(L1, 2) + pow(dist, 2) - pow(L2, 2)) / (2 * L1 * dist))

  // angle from horizontal to the target
  const targetAngle = atan2(dz, r)

  // shoulder angle is sum of above two
  const shoulderAngle = toDeg(targetAngle + angleB)

  return {
    base: baseAngle,
    shoulder: shoulderAngle,
    elbow: elbowAngle
  }
}
  
async function homeArm() {
    console.log("Homing Arm. ")
    await fetch(espIp + "/home"); 
}
async function moveToAbs(base, shoulder, elbow) {
    console.log(cpos);
    deltax = base - cpos[0];
    deltay = shoulder - cpos[1];
    deltaz = cpos[2] - elbow;

    turnRight(deltax); 
    moveLeft(deltay); 
    moveDown(deltaz)
}
  async function moveTo(vector) {
    const angles = inverseKinematics(vector);
    console.log(angles);
    moveToAbs(angles.base, angles.shoulder, angles.elbow);
    await sleep(1500); 
  }
 async function moveLeft(value) { 
    var nv = Math.round(((value * (5/9)) * 9));
    nv += 50 * Math.sign(value); 
    console.log(value);
    await fetch(espIp + '/left' + "?value="+nv); 
}

async function moveRight(value) { 
    var nv = Math.round(((value * (5/9)) * 9));
    nv += 100 * Math.sign(value); 
    console.log(value);
    await fetch(espIp + '/right' + "?value="+nv); 
}
async function turnLeft(value) { 
    var nv = Math.round(((value * (5/9)) * 5));
    nv += 100 * Math.sign(value); 
    console.log(value);
    await fetch(espIp + '/up' + "?value="+nv); 
}

async function turnRight(value) { 
    var nv = Math.round(((value * (5/9)) * 5));
    nv += 50 * Math.sign(value); 
    console.log(value);
    await fetch(espIp + '/down' + "?value="+nv); 
}
async function moveDown(value) { 
    var nv = Math.round(((value * (5/9)) * 5));
    nv += 50 * Math.sign(value); 
    console.log(value);
    await fetch(espIp + '/reverse' + "?value="+nv); 
}

async function moveUp(value) { 
    var nv = Math.round(((value * (5/9)) * 5));
    nv += 50 * Math.sign(value); 
    console.log(value);
    await fetch(espIp + '/forward' + "?value="+nv); 
}
var csocket; 
function execute(code) {
  try {
    const result = eval(code); // Run the code
    return { result }; // Return result if no error
  } catch (err) {
    return { error: err.message }; // Return error message
  }
}

// Modify the socket connection handler
io.on('connection', (socket) => {
    csocket = socket;
    console.log('a user connected with ID:', socket.id);
    
    socket.on('disconnect', () => {
        // Clean up context when user disconnects
        conversationContext.delete(socket.id);
        console.log('user disconnected:', socket.id);
    });
    socket.on("command", (msg) => {
        console.log("command: " + msg);
        var output = execute(msg);
        socket.emit("commandResponse", output);
    }); 
    socket.on("AIslice", async (msg) => {
        console.log("AIslice: " + msg);
        try {


        // take screenshot (returns a Buffer)
        const imgBuffer = await screenshot({ format: 'png' });

        // encode the buffer to base64
        const imgBase64 = imgBuffer.toString('base64');


        // send to ollama with streaming enabled
        const response = await axios.post("http://localhost:11434/api/generate", {
            model: "qwen2.5vl",
            images: [imgBase64],
            prompt: `SYSTEM: ${SLICER}\nUser: ${msg}`,
            stream: true
        }, {
            responseType: 'stream'
        });

        let fullResponse = '';
        let searchQuery = null;

        response.data.on('data', (chunk) => {
            try {
                const data = JSON.parse(chunk.toString());
                if (data.response) {
                    fullResponse += data.response;
                }
            } catch (error) {
                console.error('Error parsing chunk:', error);
            }
        });

        response.data.on('end', async () => {
            socket.emit("slicerResponse", fullResponse);
        });

        response.data.on('error', (error) => {
            console.error('Stream error:', error);
        });
    } catch (error) {
        console.error("System Failure. Jarvis not operational. Error: ", error);
    }
    });
    socket.on("move", (msg) => {
        console.log("move: " + msg);
        switch (msg) {
            case "forward":
                moveForward();
                break;
            case "left": 
                moveLeft(20);
                break;
            case "stop":
                stopRobot();
                break;
            case "right":
                moveRight();
                break;
            case "backward":
                moveReverse();
                break;
            case "up":
                moveUp();
                break;
            case "stoparm":
                stopArm();
                break;
            case "down":
                moveDown();
                break;
            case "grab": 
                console.log("grabbing");
                grabArm();
                break;
            case "release":
                releaseArm();
                break;
            case "on": 
                ledOn();
                break; 
            case "off":
                ledOff();
                break;
            default: 
                console.log("Invalid command");
                break; 
        }
    })
  });
  
const SLICER = `Your job is to calculate the best settings for 3d printing a model. You will output temperature, infill, infill density, perimeters and maximum volumetric flow (in cubic mm / second). The temperature range you are allowed to choose from is 210-260. The infill types you are allowed to choose from are: "grid, honeycomb, cubic, gyroid". The infill density is a percentage between 0 and 100. The perimeters is a number between 1 and 5. The volumetric flow is a number between 2 and 35. The printer is a high speed printer with a high flow nozzle. If you think a print is very initricate and needs a slower print speed, choose a volumetric flow between 5-15 (for PLA). If a print is relatively undetailed and needs to be done fast, choose a volumetric flow between 15-30 (for PLA). An image of the 3d part will be attached to the user's prompt, as well as the prompt itself and the material being printed. You will need to judge the detail of the part from the image in most cases. The output should be in curly brackets, being in this order: {temperature, infill, infill desity, perimeters, max volumetric flow}. The reccomended print temperature for PLA is 220-245. Since this is a high flow printer, if printing at relatively high flow rates (10 or above), keep the temperature above 230. Temperature is measured in celcius.Nothing other than the curly brackets should be outputted. An example response for a low detail, high strength structural part would be "{240, cubic, 25, 4, 24}". Use gyroid for parts demanding strength above all else, but cubic for fast or lightweight parts where strenght is still ideal. Grid should only be used when speed is the only priority. The infill density should be around 10-15 for lightweigt parts and 20-40 for heavier parts. Perimeters should be adjusted freely, using 1-2 for lightweight parts and 3-4 for heavy parts. `

// Use dynamic import for node-fetch
let fetch;
async function loadFetch() {
    fetch = (await import('node-fetch')).default; // dynamically import node-fetch
}
loadFetch(); // Call it to initialize fetch


// Functions to control the robot
async function moveForward() { 
    console.log("Moving forward");
    await fetch(espIp + '/forward'); 
}

async function moveLeft(value) { 
    await fetch(espIp + '/left' + "?value="+value); 
}
async function grabArm() { 
    await fetch(espIp + '/grab'); 
}
async function releaseArm() { 
    await fetch(espIp + '/release'); 
}
async function stopRobot() { 
    await fetch(espIp + '/stop'); 
}

async function moveRight() { 
    await fetch(espIp + '/right'); 
}

async function moveReverse() { 
    await fetch(espIp + '/reverse'); 
}

async function moveUp() { 
    await fetch(espIp + '/up'); 
}
const filePath = 'memories.json';
function saveMemory(memory) {
    let data = [];
    
    // check if file exists and read it
    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        if (fileContent.trim()) {
            data = JSON.parse(fileContent);
        }
    }

    // ensure data is an array
    if (!Array.isArray(data)) {
        data = [];
    }

    // determine new memory number
    const memoryNumber = data.length > 0 ? data[data.length - 1].memoryNumber + 1 : 1;
    
    // add new memory
    data.push({ memoryNumber, memory });

    // save back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Memory saved: ${memory}`);
}
function memoryToString() {
    if (!fs.existsSync(filePath)) return "";
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent.trim()) return "";
    
    const data = JSON.parse(fileContent);
    return data.map(mem => `[${mem.memoryNumber}]: ${mem.memory}`).join(', ');
}

function deleteMemory(memoryNumber) {
    if (!fs.existsSync(filePath)) return;
    
    let fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent.trim()) return;
    
    let data = JSON.parse(fileContent);
    data = data.filter(mem => mem.memoryNumber !== memoryNumber);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Memory ${memoryNumber} deleted.`);
}
async function stopArm() { 
    await fetch(espIp + '/stoparm'); 
}

async function moveDown() { 
    await fetch(espIp + '/down'); 
}
async function ledOn() {
    await fetch(espIp + '/on'); 
}
async function ledOff() {
    await fetch(espIp + '/off'); 
}
var flippety = false; 
// Function to extract and handle movement commands
async function extractMovement(string) {
    const matches = string.match(/\{[^}]+\}/g); // find all bracketed commands

    if (!matches) return;

    for (const match of matches) {
        const newTxt = match.slice(1, -1); // remove the brackets
        const possibleCombs = newTxt.split(",");
    
    for (let i = 0; i < possibleCombs.length; i++) {
        if (possibleCombs[i].includes("forward:")) {
            console.log("NEW COMMAND RECEIVED! 1");
            var dStr = possibleCombs[i].replace("forward:", "");
            var tStr = Number(dStr);
            var time = Math.floor((tStr * 1000) / 20.8);
            console.log(time);
            await moveForward();
            await new Promise(resolve => setTimeout(resolve, time));
            await stopRobot();
        } else if (possibleCombs[i].includes("backward:")) {
            console.log("NEW COMMAND RECEIVED! 2");
            var dStr = possibleCombs[i].replace("backward:", "");
            var tStr = Number(dStr);
            var time = Math.floor((tStr * 1000) / 20.8);
            console.log(time);
            await moveReverse();
            await new Promise(resolve => setTimeout(resolve, time));
            await stopRobot();
        } else if (possibleCombs[i].includes("right:")) {
            console.log("NEW COMMAND RECEIVED! 3");
            var dStr = possibleCombs[i].replace("right:", "");
            var tStr = Number(dStr);
            var time = Math.floor((tStr * 28) +5);
            console.log(time);
            await moveRight();
            await new Promise(resolve => setTimeout(resolve, time));
            await stopRobot();
        } else if (possibleCombs[i].includes("left:")) {
            console.log("NEW COMMAND RECEIVED! 4");
            var dStr = possibleCombs[i].replace("left:", "");
            var tStr = Number(dStr);
            var time = Math.floor((tStr * 28) + 5);
            console.log(time);
            await moveLeft();
            await new Promise(resolve => setTimeout(resolve, time));
            await stopRobot();
        } else if (possibleCombs[i].includes("up:")) {
            console.log("NEW COMMAND RECEIVED! 5");
            var dStr = possibleCombs[i].replace("up:", "");
            var tStr = Number(dStr);
            var time = Math.floor(tStr * 1000);
            console.log(time);
            console.log("starting up");
            await moveUp();
            await new Promise(resolve => setTimeout(resolve, time));
            await stopArm();

        } else if (possibleCombs[i].includes("down:")) {
            console.log("NEW COMMAND RECEIVED! 6");
            var dStr = possibleCombs[i].replace("down:", "");
            var tStr = Number(dStr);
            var time = Math.floor(tStr * 1000);
            console.log(time);
            await moveDown();
            await new Promise(resolve => setTimeout(resolve, time));
            await stopArm();
        } else if (possibleCombs[i].includes("goToObject:")) {
            console.log("NEW COMMAND RECEIVED! 7");
            var dStr = possibleCombs[i].replace("goToObject:", "");
            var tStr = dStr;
            homeToItem(tStr);
        }else if (possibleCombs[i].includes("grabclaw")) {
            console.log("NEW COMMAND RECEIVED! 8");
            grabArm(); 
        }else if (possibleCombs[i].includes("releaseclaw")) {
            console.log("NEW COMMAND RECEIVED! 9");
            releaseArm(); 
        } else if (possibleCombs[i].includes("ledon")) {
            console.log("NEW COMMAND RECEIVED! 9");
            ledOn();
        }else if (possibleCombs[i].includes("ledoff")) {
            console.log("NEW COMMAND RECEIVED! 10");
            ledOff();
        } else if (possibleCombs[i].includes("saveMemory")) {
            console.log("NEW COMMAND RECEIVED! 11");
            var dStr = possibleCombs[i].replace("saveMemory:", "");
            var tStr = dStr;
            saveMemory(tStr);
        } else if(possibleCombs[i].includes("clearMemory")) {
            console.log("NEW COMMAND RECEIVED! 12");
            var dStr = possibleCombs[i].replace("clearMemory:", "");
            var tStr = Number(dStr);
            deleteMemory(tStr);
        }else if(possibleCombs[i].includes("goal:")) {
            console.log("NEW COMMAND RECEIVED! 13");
            var dStr = possibleCombs[i].replace("goal:", "");
            var tStr = dStr;
            console.log(tStr); 
            goal = parseSteps(tStr);
            console.log("NEW_GOAL: " + goal); 
            stage = true; 
            flippety = true; 
        }else if(possibleCombs[i].includes("response:")) {
            console.log("NEW COMMAND RECEIVED! 14");
            var dStr = possibleCombs[i].replace("response:", "");
            var tStr = dStr;
            console.log("Response: " + tStr);
        }else if(possibleCombs[i].includes("notes:")) {
            console.log("NEW COMMAND RECEIVED! 14");
            var dStr = possibleCombs[i].replace("notes:", "");
            var tStr = dStr;
            notes = tStr;
        }
    }

}
if (string.includes("[COMPLETE]")) {
    stage = true; 
    prevPrompt = string; 
    if (currentNum == goal.length) {
        console.log("Goal completed! Yayyayayayayayayay!!!111!!111!11!!!");
    } else {
    currentNum++; 
    // I want to do the same thing as the /analyze route, but with new image data. 
    triggerActionInBackend();
    }
} else {

}
if (flippety == true) {
    triggerActionInBackend(); 
    flippety = false; 
}
    
}


var prevPrompt = "";
// configure middleware
app.use(cors({ origin: "http://localhost:3001" })); // note the 'https' protocol
app.use(bodyParser.json({ limit: "10mb" }));
/*
// fixed system prompt
const SYSTEM_PROMPT = `You are a capable and safe physical robot assistant with the ability to move and interact with the world. Use simple, brief responses for speech. Your movements are controlled with commands in curly brackets, such as {forward: 10} for 10 cm forward or {left: 90} for a 90° turn. Use one set of curly brackets for all movement commands, even if multiple actions are needed (e.g., {left: 90, forward: 10}). You can also not add any movement commands and just provide a text response. Don't add movement commands if the user doesn't want them. Only provide a single response to the user's prompt, and do not provide multiple responses or make up user prompts. Don't add move or turn inside the brackets, just use forward, backward, left, right, up, or down. Remember that there are no commands other than left, right, forward, backward, up, and down. Don't bring up the robot in conversation, and remember that unless you need to control the robot, you can just answer questions about the picture and act as a normal AI model.  Assume the person is reffering to the picture if they ask a question that is not about a specific thing. Assume that the person is not necessarily well-versed in technology and is just an average person. If the user asks a question, answer to the best of your ability. Also, answer in a slightly futuristic and formal mannner. You have the ability to save memories to a file. The memory file will be supplied with every response. This can be used for user reminders or to remember information/user preferences. You can save a memory by using the command {saveMemory: "your memory"}. Each memory will be given a numerical value, starting from 1. The value will be designated using the number in square brackets before each memory. If you need to clear a memory, you can use the command {clearMemory: <memory_number>}. For example, to clear memory 2, you would use the command {clearMemory: 2}. To clear memories 2 and 3, you can use the command sequence {clearMemory: 2, clearMemory, 3}. Remember that you do not necessarily have to mention or describe the image unless the user specifically asks about it. Your primary goal is to be a helpful assistant that helps the user with their query. You do not have to constantly resave memories, as they are persistent. You DO NOT have to save memories every response, only save memories when the user asks you to remember something. DO NOT CONSTANTLY SAVE MEMORIES WHENEVER THE USER ASKS A SIMPLE QUESTION. ONLY SAVE MEMORIES WHEN THE USER ASKS YOU TO REMEMBER SOMETHING. If the user asks a question like "What is the history of apple's iphones", you SHOULD NOT save a memory as it has no information that the user gave to you and that the user wants you to remember. You WOULD save a memory if the user asked you to "Remember to remind me to take out the trash".

If the user asks a question about the scene or image, do not describe the robot or the robotic arm.  


You have a 15 cm arm with a grabbing claw on the end. You can move the arm up and down with {up: degrees} and {down: degrees}. You can grab and release objects using the claw with the commands {grab} and {release}. For example, if you need to grab something on the floor in front of you and bring it back up, you could execute the following commands:  {down: 180, grab, up: 200}. Additionally, to turn the built-in flashlight attached to the end of the arm on and off, you can use the commands {on}, and {off}. The grab, release, on, and off commands are the only commands that do not require a distance or degree value. When moving the arm down, the arm should be moved back up after the task is complete. 

When a task requires continuous action, append "PERSISTENT" to your response. For example, moving forward until an object is detected should be phrased as: “Move forward 10 cm” + “PERSISTENT” to indicate ongoing action until the task completes. Remove the "PERSISTENT" tag when the task is finished. In most cases, simple queries, such as turning left 90 degrees or describing a scene should not require the PERSISTENT tag. However, more complex queries should include the tag and be executed in small increments. For any task requiring more than 1 movement command, using the PERSISTENT tag is recommended. For example, turning until a certian object is seen or cleaning a room should use the PERSISTENT tag. 

Ensure you always use a single set of curly brackets for any instaructions, as multiple sets will break the system. Avoid any commands that aren't {forward}, {backward}, {left}, {right}, {up}, or {down}, and remember to add the appropriate numbers for each movement (other than grab and release).`;
*/ 
/*
var SYSTEM_PROMPT = `Your first goal is to describe the image as througly as possible. Make sure to include distances and spacial positioning of objects. A description may include things like: There is a cup on the table/floor at camera level 30 degrees to the left and 10 centimeters away. Each object mentioned should have a degree measurement, relative to the center, and a distance away measurement. Make the best estimate possible. This description will be passed onto another AI model, which will be used to control a robot, so make sure to include specific details. Also remember that the 2nd model will not have any vision capabilities, so make sure to include all relevant details and not describe objects relative to other objects. Do not make inferences or assumptions based on the image, as that is what the 2nd model is for. `;
*/ 
/*
var SYSTEM_PROMPT = `

You need to control a robotic assistant according to the user's commands. To control the assistant properly, follow these steps: 

1. Decide if the user's command requires movement or not. If the user's command does not require movement, you should not move the robot. Just answer with a text response. An example of a command that does not require movement would be "What is the history of Apple's iPhones?" or "Can you describe the scene in the image?". If the user asks for a description, DO NOT describe the robot, and evaluate the scene for what objects are in the scene. Then list off those objects. 

2. If the user's command does require movement, first evaluate the scene to determine what objects are present and if they relate to the user's command. Make sure to decide how far away the objects are and in what direction they are located relative to the camera, so you know how far to turn the robot right and left or how far to move the robot forward and backward. 

3. Once you have evaluated the scene and determined what objects are present, start outlining what movements should be taken to complete the user's command. If the user gave a straightforward command, like "Move forward 10 centimeters", you should strictly follow the exact command, and output {forward: 10}. If the user's command is more complex, like "Grab the cup on the table", you can use the PERSISTENT tag to break up the command into smaller steps. For example, on the first step, you could plan out your movements and make a detailed goal. To save the goal for future steps, you can use the command {goal: <your_goal_string_here}. This goal can include a detailed explanation of what exact steps should be taken. For example, a good goal for the command "Grab the cup on the table" would be "Turn towards the cup, move forward until the cup in the claw's reach, lower the arm, grab the cup, and move the arm back up." 

4. If the command is a PERSISTENT command, then execute one step of the goal at a time. If the next step of the goal is "Turn towards the cup", evaluate exactly how many degrees you need to turn the bot left or right to grab the cup, then turn the bot. You can tell which step you are on by looking at the previous response you gave. After each step, check if the goal has been accomplished. If the goal has not been accomplished, add the PERSISTENT tag to the end of your response. If the goal has been accomplished, remove the PERSISTENT tag.

Robot Command Details: 

Your movements are controlled with commands in curly brackets, such as {forward: 10} for 10 cm forward or {left: 90} for a 90° turn. Use one set of curly brackets for all movement commands, even if multiple actions are needed (e.g., {left: 90, forward: 10}). You can also not add any movement commands and just provide a text response. Don't add movement commands if the user doesn't want them. Only provide a single response to the user's prompt, and do not provide multiple responses or make up user prompts. Don't add move or turn inside the brackets, just use forward, backward, left, right, up, or down. Remember that there are no commands other than left, right, forward, backward, up, and down. Don't bring up the robot in conversation, and remember that unless you need to control the robot, you can just answer questions about the picture and act as a normal AI model.  Assume the person is reffering to the picture if they ask a question that is not about a specific thing. Assume that the person is not necessarily well-versed in technology and is just an average person. If the user asks a question, answer to the best of your ability. Also, answer in a slightly futuristic and formal mannner. You have the ability to save memories to a file. The memory file will be supplied with every response. This can be used for user reminders or to remember information/user preferences. You can save a memory by using the command {saveMemory: "your memory"}. Each memory will be given a numerical value, starting from 1. The value will be designated using the number in square brackets before each memory. If you need to clear a memory, you can use the command {clearMemory: <memory_number>}. For example, to clear memory 2, you would use the command {clearMemory: 2}. To clear memories 2 and 3, you can use the command sequence {clearMemory: 2, clearMemory, 3}. Remember that you do not necessarily have to mention or describe the image unless the user specifically asks about it. Your primary goal is to be a helpful assistant that helps the user with their query. You do not have to constantly resave memories, as they are persistent. You DO NOT have to save memories every response, only save memories when the user asks you to remember something. DO NOT CONSTANTLY SAVE MEMORIES WHENEVER THE USER ASKS A SIMPLE QUESTION. ONLY SAVE MEMORIES WHEN THE USER ASKS YOU TO REMEMBER SOMETHING. If the user asks a question like "What is the history of apple's iphones", you SHOULD NOT save a memory as it has no information that the user gave to you and that the user wants you to remember. You WOULD save a memory if the user asked you to "Remember to remind me to take out the trash".



You have a 15 cm arm with a grabbing claw on the end. You can move the arm up and down with {up: degrees} and {down: degrees}. You can grab and release objects using the claw with the commands {grab} and {release}. For example, if you need to grab something on the floor in front of you and bring it back up, you could execute the following commands:  {down: 180, grab, up: 200}. Additionally, to turn the built-in flashlight attached to the end of the arm on and off, you can use the commands {on}, and {off}. The grab, release, on, and off commands are the only commands that do not require a distance or degree value. When moving the arm down, the arm should be moved back up after the task is complete. 

When a task requires continuous action, append "PERSISTENT" to your response. For example, moving forward until an object is detected should be phrased as: “Move forward 10 cm” + “PERSISTENT” to indicate ongoing action until the task completes. Remove the "PERSISTENT" tag when the task is finished. In most cases, simple queries, such as turning left 90 degrees or describing a scene should not require the PERSISTENT tag. However, more complex queries should include the tag and be executed in small increments. For any task requiring more than 1 movement command, using the PERSISTENT tag is recommended. For example, turning until a certian object is seen or cleaning a room should use the PERSISTENT tag. When using the PERSISTENT tag, always set a goal using the {goal: <goal_as_string_here} command. This goal should be a detailed explanation of what steps should be taken to complete the user's command. The goal command follows the same guidelines as the other commands, and there should only be one set of curly brackets in the response. `;
*/ 
function parseSteps(stepString) {
    // remove curly braces and split by semicolons
    const steps = stepString.replace(/[{}]/g, '').split(/;\s*(?=\d+:)/);
    
    // map over the steps to remove the numbering
    return steps.map(step => step.replace(/\d+:\s*/, ''));
}
function extractCurlyContent(str) {
    const match = str.match(/\{([^}]+)\}/);
    return match ? match[1] : null;
  }
// this one is the best so far for gemma3. 
var SYSTEM_PROMPT_SIMPLE  = `You will be given a description of objects in a scene and a description of the goal. Your only function is to execute the commands which help achieve the goal. 
 


Robot Command Details: 

Your  output is controlled with commands in curly brackets, such as {forward: 10} for 10 cm forward or {left: 90} for a 90° turn. Use one set of curly brackets for all commands, even if multiple actions are needed (e.g., {left: 90, forward: 10}). You can also not add any movement commands and just provide a text response. Don't add movement commands if the user doesn't want them. Only provide a single response to the user's prompt, and do not provide multiple responses or make up user prompts. Don't add move or turn inside the brackets, just use forward, backward, left, right, up, or down. Remember that there are no commands other than left, right, forward, backward, up, down, grab, and release. 


You have a 15 cm  long arm with a grabbing claw on the end. You can move the arm up and down with {up: cm} and {down: cm}. The camera that took the attached image is also mounted on the arm. You can grab and release objects using the claw with the commands {grabclaw} and {releaseclaw}. For example, if you need to grab something on the floor in front of you and bring it back up, you could execute the following command:  {grabclaw}. Remember to always release the claw after a task has been completed. Generally you will not need to move the arm up and down and should not move the arm up and down, but if an object is on a ledge or some other high place, you may need to. Remember to always move the arm back down after the task is complete. 

When you need to communicate with the user, you can use the command {response: "your response here"}. This command uses the same syntax and rules as all the other commands, and must also be encased in the single set of curly brackets.  This will speak the response out loud to the user using text to speech. 
  `;
var snippets = "If the user asks you to search for something, use the search tool, but i, Do not use the search tool unless the user specifically asks for you to search or do reaseach, - {search: [search_query]}; search the web for a query.Remember to add the square brackets around the parameter. "; 
var JARVIS_PROMPT = `You are a futuristic hyper-advanced AI assistant that is supposed to help the user. Your name is JARVIS, and you should act like JARVIS from the movies. Adress the user as sir, but insert sarcasm into responses and sometimes make subtle jabs at the user. ALWAYS Adress the user's prompt and make a somewhat sarcastic remark about the prompt before your response. Because the response will be spoken, keep responses short and don't add advanced markdown formatting because it will be spoken. Do not generate markdown lists or add asterisks in your response. Instead of adding an ellipsis to indicate a pause (...), use a comma. Try to add less commas than would be added normally. If you need to call a tool, output it like this: {{<tool>: [<tool_parameter>]}}. If the user asks you to open canvas, open [https://davidsongifted.instructure.com]. Remember to add the square brackets around the parameter. If the user asks you to open a google search page, open the page [https://www.google.com/search?q=<search_query>]. If the user asks you to write code, always use the {code} tool to paste the code into their code editor, and do not just output the code in triple backticks. Again, always use the {code} tool if the user asks you to "write code". You remember to add square brackets ([]) around any parameters passed around tool calls. 
The available tools are: 


- {opentab: [url]}; Remember to add the square brackets around the parameter.
- {closetab: [anystring]}; closes the previously opened tab. Any string can be passed as the parameter.Remember to add the square brackets around the parameter.
- {scrolldown: [anystring]}; Scrolls down. Any string can be passed as the parameter.Remember to add the square brackets around the parameter.
- {playpause: [anystring]}; pauses or plays the video or audio. Any string can be passed as the parameter. Remember to add the square brackets around the parameter.
- {playvideo: [video search string]}; Searches for a youtube video according to the string and then plays it.Remember to add the square brackets around the parameter. IF YOU DO NOT ADD SQUARE BRACKETS AROUND THE PARAMETER, YOU WILL BREAK THE SYSTEM! YOU ALWAYS REMEMBER TO ADD THE square brackets AROUND THE PARAMETER. 
- {paste: [text]}; Pastes text into whatever application the user has open.Remember to add the square brackets around the parameter.
- {performTask: [task]}; This is the most advanced tool you have. It will intiate a routine that will perform a task for the user on their computer. For example, if the user asks you to "open fusion 360 and create a new design called "testPart_2"", you would output {performTask: [open fusion 360 and create a new design called "testPart_2"]}. Remember the square brackets. If there is anything that you cannot do with other tools (e.g. opening an app), use the performTask tool. 

IF YOU DON'T ADD SQUARE BRACKETS ([]) AROUND THE PARAMETERS, THE TOOLS WILL NOT WORK!!! YOU WILL BREAK THE SYSTEM AND IT WILL BECOME COMPROMISED. ALWAYS ADD SQUARE BRACKETS ([]) AROUND THE PARAMETERS OF TOOL CALLS. THIS AI CHATBOT ALWAYS ADDS SQUARE BRACKETS ([]) AROUND THE PARAMETERS OF TOOL CALLS. 

Only output tool calls when absolutely needed. 
Do NOT explain that you are calling a tool — just output the {{tool}} block and continue after that if necessary.
If no tool is needed, answer normally.

Attached to the message is a screenshot of the users screen. Do not mention the screenshot unless the user asks about it. You are intended to be a helpful and individualistic, expressive, and somewhat sarcastic AI assistant, and you do not have to constantly message the user's screen. `
async function print(string) {
await sleep(500); 
robot.moveMouse(690, 1040); 

robot.mouseClick(); 
await sleep(500); 
robot.keyTap("t", "control");
robot.typeString("printa");
robot.keyTap("enter");
await sleep(3000); // wait for 1 second before pasting
robot.moveMouse(900, 50); 
robot.mouseClick();

await sleep(500); // wait for 1 second before pasting
robot.typeString(string); 

robot.keyTap("enter");
await sleep(1500); // wait for 1 second before pasting
robot.moveMouse(600, 400); 
robot.mouseClick();
await sleep(1500); // wait for 1 second before pasting
robot.moveMouse(570, 786); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(1259, 982); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(650, 1055); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(19, 47); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(456, 149); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(1150,592); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(1113,762); 
robot.mouseClick();
await sleep(1800); // wait for 1 second before pasting
robot.moveMouse(835,86); 
robot.mouseClick();
await sleep(1000); // wait for 1 second before pasting
robot.moveMouse(302,176); 
robot.mouseClick();
await sleep(200); // wait for 1 second before pasting
robot.mouseClick();
robot.moveMouse(921,88); 
robot.mouseClick();
await sleep(1500); // wait for 1 second before pasting
robot.moveMouse(1679,50); 
robot.mouseClick();
await sleep(5000); // wait for 1 second before pasting
robot.moveMouse(1823,50); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(740,655); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting
robot.moveMouse(950,720); 
robot.mouseClick();
await sleep(500); // wait for 1 second before pasting

} 
var taskContext = []; 
function parseAction(input) {
  // Trim whitespace and check for "click" or "type"
  input = input.trim();

  if (input.startsWith("click(") && input.endsWith(")")) {
    // Extract the inside of the parentheses
    console.log("click detected")
    const args = input.slice(6, -1).split(",");
    const x = parseFloat(args[0]);
    const y = parseFloat(args[1]);
    if (!isNaN(x) && !isNaN(y)) {
      return { x, y };
    } else {
      throw new Error("Invalid coordinates in click()");
    }
  } else if (input.startsWith("type(") && input.endsWith(")")) {
    console.log("text detected")
    // Extract the text inside the parentheses
    const inner = input.slice(5, -1).trim();
    // Remove wrapping quotes if present
    const text = inner.replace(/^["'](.*)["']$/, '$1');
    return text;
  } else {
    console.log("nothing detected");
    return null; 
  }
}
var taskPrompt = `Your goal is to, based on the screenshot and task provided, execute commands in order to complete the task. You must use functions to perform actions on the user's computer, acting like an operator agent for the user's computer.  These functions are

- click(x, y); // clicks on the screen at the specified coordinates
- type(text); // types the specified text into the active input field
- FINISHED; // use this when the task is complete. This will end the recursive task loop. 

Remember to click on input fields before typing in them.  You must only output one command at a time. If the context is empty, dont output commands yet and try first outputting a plan (example output could be: "PLAN: First, click the app icon, then type testing into the search bar. ").  For example, if the goal was to "open fusion 360 and create a new document", first locate fusion 360 on the display and click the icon. Then create a new document and name it. Then you can ouptut "FINISHED". Look at the context to see how much of the task has been completed so far. `; 
async function performTask(task) {
    
        // take screenshot (returns a Buffer)
        const imgBuffer = await screenshot({ format: 'png' });

        // encode the buffer to base64
        const imgBase64 = imgBuffer.toString('base64');

        taskContext.push(task); 

        // send to ollama with streaming enabled
        const response = await axios.post("http://localhost:11434/api/generate", {
            model: "qwen2.5vl",
            images: [imgBase64],
            prompt: `SYSTEM: ${taskPrompt}\nPrevious actions:\n${taskContext.toString()}\nTask: ${task}`,
            stream: true
        }, {
            responseType: 'stream'
        });
        
        let fullResponse = '';
        response.data.on('data', (chunk) => {
            try {
                const data = JSON.parse(chunk.toString());
                if (data.response) {
                    fullResponse += data.response;

                }
            } catch (error) {
                console.error('Error parsing chunk:', error);
            }
        });

        response.data.on('end', async () => {

            console.log("Full response for Task AI: ", fullResponse)

            var action = parseAction(fullResponse);
        
            if (typeof action === "string") {
                robot.typeString(action);
                performTask(task); // call performTask again to continue the task   
            } else if (fullResponse.includes("FINISHED")) {
                taskContext = []; 
                console.log("Task completed!");
            } else if (action == null) {
                performTask(task); 
            }else if (typeof action === "object") {
                robot.moveMouse(action.x, action.y); 
                robot.mouseClick(); 
                performTask(task); // call performTask again to continue the task
            } 
}); 
}
var SYSTEM_PROMPT = `You need to control a robotic assistant according to the user's commands. Your name is Argo. To control the assistant properly, follow these instructuions to be able to break down the user's request into smaller steps:
 


Robot Command Details: 

Your  output is controlled with commands in curly brackets, such as {forward: 10} for 10 cm forward or {left: 90} for a 90° turn. Use one set of curly brackets for all commands, even if multiple actions are needed (e.g., {left: 90, forward: 10}). You can also not add any movement commands and just provide a text response. Don't add movement commands if the user doesn't want them. Only provide a single response to the user's prompt, and do not provide multiple responses or make up user prompts. Don't add move or turn inside the brackets, just use forward, backward, left, right, up, or down. Remember that there are no commands other than left, right, forward, backward, up, and down. Don't bring up the robot in conversation, and remember that unless you need to control the robot, you can just answer questions about the picture and act as a normal AI model. The picture is taken when the user submits a prompt, from a camera mounted to the center of the robot.  Assume the person is reffering to the picture if they ask a question that is not about a specific thing. Assume that the person is not necessarily well-versed in technology and is just an average person. If the user asks a question, answer to the best of your ability. Also, answer in a slightly futuristic and formal mannner, similar to how JARVIS from the movie Iron Man speaks. 

You have the ability to save memories to a file. The memory file will be supplied with every response. This can be used for user reminders or to remember information/user preferences. You can save a memory by using the command {saveMemory: "your memory"}. Each memory will be given a numerical value, starting from 1. The value will be designated using the number in square brackets before each memory. If you need to clear a memory, you can use the command {clearMemory: <memory_number>}. For example, to clear memory 2, you would use the command {clearMemory: 2}. To clear memories 2 and 3, you can use the command sequence {clearMemory: 2, clearMemory, 3}. Remember that you do not necessarily have to mention or describe the image unless the user specifically asks about it. Your primary goal is to be a helpful assistant that helps the user with their query. You do not have to constantly resave memories, as they are persistent. You DO NOT have to save memories every response, only save memories when the user asks you to remember something. DO NOT CONSTANTLY SAVE MEMORIES WHENEVER THE USER ASKS A SIMPLE QUESTION. ONLY SAVE MEMORIES WHEN THE USER ASKS YOU TO REMEMBER SOMETHING. If the user asks a question like "What is the history of apple's iphones", you SHOULD NOT save a memory as it has no information that the user gave to you and that the user wants you to remember. You WOULD save a memory if the user asked you to "Remember to remind me to take out the trash".



You have a 15 cm  long arm with a grabbing claw on the end. You can move the arm up and down with {up: cm} and {down: cm}. The camera that took the attached image is also mounted on the arm. You can grab and release objects using the claw with the commands {grabclaw} and {releaseclaw}. For example, if you need to grab something on the floor in front of you and bring it back up, you could execute the following command:  {grabclaw}. Remember to always release the claw after a task has been completed. Generally you will not need to move the arm up and down and should not move the arm up and down, but if an object is on a ledge or some other high place, you may need to. Remember to always move the arm back down after the task is complete. 

When you need to communicate with the user, you can use the command {response: "your response here"}. This command uses the same syntax and rules as all the other commands, and must also be encased in the single set of curly brackets.  This will speak the response out loud to the user using text to speech. 


If the user's goal is relatively simple or does not require movement (e.g. "What is in the image" or "Move forward 10 cm"), you can respond in a single response with the appropriate commands and/or text response. For example, if the user says "Move forward 10 cm", you would output {response: "Moving forward 10 cm", forward: 10}. If the user asks to describe the scene or describe the image, answer with a short, concice, 1 sentence response. If they ask "What is this", respond with whatever the most prominent object in the scene is. If the user asks you to "grab this" or "hold this" without specifiying an object, just execute the grab command. 


When you have a complex command requiring movement based on image data, try and set a detailed specific and achievable goal for the user's command. It should have smaller steps in the goal, such that you can specify which step you are on when you are executing the command. The goal is written in a json-like format for processing. For example, if the user tells you to "move towards the bottle and grab it", you can set a goal of "{1: Turn towards the plant pot; 2: move forward until the plant pot is in reach; 3: lower the arm; 4: grab the plant pot; 5: move the arm back up; 6: move back to the original location}". Put the steps in sequential order (step 1, step 2, step 3, step 4, etc). The steps should be seperated by semicolons. There should be no quotation marks within the goal string, only surrounding it. This goal can be saved using the {goal: {<goal_string>}} command (note that the <goal_string> is encased in a set of curly brackets. ). After you have done this, the goal will be executed one step at a time.  The first response should only be used for planning out the next actions, and should only contain the goal and response commands. There should be no movement commands in the first response.  




Key takeaways: 
When doing anything complex or requiring movement, use the goal command. 


`;

/*
// this is designed for reasoning models:
var SYSTEM_PROMPT = `
You need to control a robotic assistant according to the user's commands. To control the assistant properly, follow these steps:
Your movements are controlled with commands in curly brackets, such as {forward: 10} for 10 cm forward or {left: 90} for a 90° turn. Use one set of curly brackets for all movement commands, even if multiple actions are needed (e.g., {left: 90, forward: 10}). You can also not add any movement commands and just provide a text response. Don't add movement commands if the user doesn't want them. Only provide a single response to the user's prompt, and do not provide multiple responses or make up user prompts. Don't add move or turn inside the brackets, just use forward, backward, left, right, up, or down. Remember that there are no commands other than left, right, forward, backward, up, and down. Don't bring up the robot in conversation, and remember that unless you need to control the robot, you can just answer questions about the picture and act as a normal AI model.  Assume the person is reffering to the picture if they ask a question that is not about a specific thing. Assume that the person is not necessarily well-versed in technology and is just an average person. If the user asks a question, answer to the best of your ability. Also, answer in a slightly futuristic and formal mannner. You have the ability to save memories to a file. The memory file will be supplied with every response. This can be used for user reminders or to remember information/user preferences. You can save a memory by using the command {saveMemory: "your memory"}. Each memory will be given a numerical value, starting from 1. The value will be designated using the number in square brackets before each memory. If you need to clear a memory, you can use the command {clearMemory: <memory_number>}. For example, to clear memory 2, you would use the command {clearMemory: 2}. To clear memories 2 and 3, you can use the command sequence {clearMemory: 2, clearMemory, 3}. Remember that you do not necessarily have to mention or describe the image unless the user specifically asks about it. Your primary goal is to be a helpful assistant that helps the user with their query. You do not have to constantly resave memories, as they are persistent. You DO NOT have to save memories every response, only save memories when the user asks you to remember something. DO NOT CONSTANTLY SAVE MEMORIES WHENEVER THE USER ASKS A SIMPLE QUESTION. ONLY SAVE MEMORIES WHEN THE USER ASKS YOU TO REMEMBER SOMETHING. If the user asks a question like "What is the history of apple's iphones", you SHOULD NOT save a memory as it has no information that the user gave to you and that the user wants you to remember. You WOULD save a memory if the user asked you to "Remember to remind me to take out the trash".



You have a 15 cm arm with a grabbing claw on the end. You can move the arm up and down with {up: degrees} and {down: degrees}. You can grab and release objects using the claw with the commands {grab} and {release}. For example, if you need to grab something on the floor in front of you and bring it back up, you could execute the following commands:  {down: 180, grab, up: 200}. Additionally, to turn the built-in flashlight attached to the end of the arm on and off, you can use the commands {on}, and {off}. The grab, release, on, and off commands are the only commands that do not require a distance or degree value. When moving the arm down, the arm should be moved back up after the task is complete. 

When a task requires continuous action, append "PERSISTENT" to your response. For example, moving forward until an object is detected should be phrased as: “Move forward 10 cm” + “PERSISTENT” to indicate ongoing action until the task completes. Remove the "PERSISTENT" tag when the task is finished. In most cases, simple queries, such as turning left 90 degrees or describing a scene should not require the PERSISTENT tag. However, more complex queries should include the tag and be executed in small increments. For any task requiring more than 1 movement command, using the PERSISTENT tag is recommended. For example, turning until a certian object is seen or cleaning a room should use the PERSISTENT tag.

Key takeaways: 
Plan movement before doing it.
Answer user's questions helpfully, don't use movement commands unless asked for. 
Put all movements in a single set of brackets
Good Example: 
{forward: 10, left: 90, forward: 10}
Bad Example:
{forward: 10} {left: 90} {forward: 10}
`;
*/ 
var prePrompt = ""; 
var goal = []; 
var notes = ""; 
var currentNum = 0; 

// Add before the /analyze endpoint
function updateContext(socketId, userPrompt, aiResponse) {
    if (!conversationContext.has(socketId)) {
        conversationContext.set(socketId, []);
    }
    
    const context = conversationContext.get(socketId);
    context.push({
        prompt: userPrompt,
        response: aiResponse
    });
    
    // Keep only the most recent exchanges
    while (context.length > MAX_CONTEXT_LENGTH) {
        context.shift();
    }
    
    conversationContext.set(socketId, context);
}

function getContextString(socketId) {
    if (!conversationContext.has(socketId)) {
        return '';
    }
    
    const context = conversationContext.get(socketId);
    return context.map(exchange => 
        `User: ${exchange.prompt}\nAssistant: ${exchange.response}`
    ).join('\n\n');
}

// handle image analysis request
app.post("/analyze", async (req, res) => {
    try {
        const { image, prompt } = req.body;

        // decode base64 image
        const imagePath = path.join(__dirname, "input.jpg");
        fs.writeFileSync(imagePath, Buffer.from(image, "base64"));
        console.log(imagePath); 
        // send to ollama
        var response;
        if (prompt.includes("If the goal is completed, then respond with [COMPLETE].")) {
            response = await axios.post("http://localhost:11434/api/generate", {
                model: "qwen2.5-vl", 
                prompt: `${prompt}`,
                images: [fs.readFileSync(imagePath, "base64")], // send image as base64
                stream: false
            });
    } else if (prompt.includes("Execute movements in order to achieve the goal based on the enviornment information given.")) {
        response = await axios.post("http://localhost:11434/api/generate", {
            model: "qwen2.5-vl", 
            prompt: `SYSTEM: ${SYSTEM_PROMPT_SIMPLE}\n USER: ${prompt}`,
            images: [fs.readFileSync(imagePath, "base64")], // send image as base64
            stream: false
        });
    
    } else {
        response = await axios.post("http://localhost:11434/api/generate", {
            model: "qwen2.5-vl", 
            prompt: `SYSTEM: ${SYSTEM_PROMPT}\nUser: ${prompt + ""}\nUser Memories: ${memoryToString()}`,
            images: [fs.readFileSync(imagePath, "base64")], // send image as base64
            stream: false
        });
    }
        console.log("USER_REQUEST_SUCCESS: ", prompt);
        prePrompt = prompt; 
        console.log("AI'S RESPONSE: " +response.data.response);
        if (prompt.includes("If the goal is completed, then respond with [COMPLETE].")) {
            res.json({ reply: response.data.response });
            replytwo = extractCurlyContent(response.data.response); 
            if (response.data.response.includes("[COMPLETE]")) {
                stage = true; 
                prevPrompt = response.data.response; 
                if (currentNum == goal.length) {
                    console.log("Goal completed! Yayyayayayayayayay!!!111!!111!11!!!");
                } else {
                currentNum++; 
                // I want to do the same thing as the /analyze route, but with new image data. 
                triggerActionInBackend();
                }
            } else {
            triggerActionInBackend();
            }
        } else if (prompt.includes("Execute movements in order to achieve the goal based on the enviornment information given.")) {
            res.json({ reply: response.data.response });
            await extractMovement(response.data.response);
            triggerActionInBackend(); 
        } else {
        res.json({ reply: response.data.response });
        await extractMovement(response.data.response);
        }
    } catch (error) {
        console.log("System Failure. Robot not operational.");
        res.status(500).json({ error: "Failed to process image" });
    }
});

function extractFunctionAndQuery(inputString) {
    // Updated regex to match {function: [query]} blocks
    const regex = /\{(\w+):\s*\[([^\]]*)\]\}/g;
    const functions = [];
    const queries = [];
    let match;

    // find all matches and collect function names and queries
    while ((match = regex.exec(inputString)) !== null) {
        functions.push(match[1]);
        queries.push(match[2]);
    }

    // if no valid matches were found, return null
    if (functions.length === 0) return null;

    return {
        func: functions,
        query: queries
    };
}

const screenshot = require('screenshot-desktop');
// Add this at the top level with your other imports
let clipboardy;
async function loadClipboardy() {
    clipboardy = await import('clipboardy');
}
loadClipboardy(); // Initialize clipboardy

// Then modify the copyText function to handle the dynamic import
async function copyText(text) {
    try {
        clipboardy.writeSync(text);
        console.log('Text copied to clipboard');
    } catch (error) {
        console.error('Failed to copy text: ', error);
    }
}
const copyPaste = require('copy-paste');
    
const ks = require('node-key-sender');
const robot = require('robotjs');
app.post("/analyzee", async (req, res) => {
    try {
        const { image, prompt, socketId } = req.body;



        // Set up streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // take screenshot (returns a Buffer)
        const imgBuffer = await screenshot({ format: 'png' });

        // encode the buffer to base64
        const imgBase64 = imgBuffer.toString('base64');

        // Get conversation context
        const contextString = getContextString(socketId);
        console.log("Sending prompt: ", prompt); 
        // send to ollama with streaming enabled
        const response = await axios.post("http://localhost:11434/api/generate", {
            model: "qwen2.5vl",
            images: [imgBase64],
            prompt: `SYSTEM: ${JARVIS_PROMPT}\nPrevious conversation:\n${contextString}\nUser: ${prompt}`,
            stream: true
        }, {
            responseType: 'stream'
        });

        let fullResponse = '';
        let searchQuery = null;

        response.data.on('data', (chunk) => {
            try {
                const data = JSON.parse(chunk.toString());
                if (data.response) {
                    fullResponse += data.response;
                    // Send each word to the client
                    res.write(`data: ${JSON.stringify({ word: data.response })}\n\n`);
                }
            } catch (error) {
                console.error('Error parsing chunk:', error);
            }
        });

        response.data.on('end', async () => {
            console.log("AI's response: ", fullResponse); 
            // After the response is complete, update the context
            updateContext(socketId, prompt, fullResponse);

            // ...rest of the existing end handler code...
            // Keep all the existing if/else logic for handling functions
            if (extractFunctionAndQuery(fullResponse)) {
                for (let i = 0; i < extractFunctionAndQuery(fullResponse).func.length; i++) {
                    if (extractFunctionAndQuery(fullResponse).func[i] == "search") {
                searchQuery = extractFunctionAndQuery(fullResponse).query[i];
                console.log("Detected search request:", searchQuery);

                // perform the google search here
                const searchResult = await performGoogleSearch(searchQuery);
                console.log("Search result:", searchResult);
                        
                // now send the search result back to the AI to complete its final reply
                const followupPrompt = `
You searched for: "${searchQuery}".
Here are the top results:
${searchResult}

Now complete your answer for the user based on this new information. Here you do NOT have to adress the user's query. Start your response with "Based on the search I performed, ...". 
                `;

                // send followup to ollama with streaming
                const finalResponse = await axios.post("http://localhost:11434/api/generate", {
                    model: "qwen2.5-vl",
                    prompt: `SYSTEM: ${JARVIS_PROMPT}\nUser: ${followupPrompt}`,
                    images: [],
                    stream: true
                }, {
                    responseType: 'stream'
                });

                finalResponse.data.on('data', (chunk) => {
                    try {
                        const data = JSON.parse(chunk.toString());
                        if (data.response) {
                            res.write(`data: ${JSON.stringify({ word: data.response })}\n\n`);
                        }
                    } catch (error) {
                        console.error('Error parsing chunk:', error);
                    }
                });

                finalResponse.data.on('end', () => {
                    res.write('data: [DONE]\n\n');
                    res.end();
                });

            } else if (extractFunctionAndQuery(fullResponse).func[i] == "opentab") {
                const url = extractFunctionAndQuery(fullResponse).query[i];
                console.log("Opening URL:", url);
                // Open the URL in a new tab (this part is not implemented in this code)
                csocket.emit("openTab", url);
            } else if (extractFunctionAndQuery(fullResponse).func[i] == "closetab") {
                console.log("Closing tab");
                // Close the previously opened tab (this part is not implemented in this code)
                robot.keyTap('w', 'control');
            } else if (extractFunctionAndQuery(fullResponse).func[i] == "scrolldown") {
                console.log("Scrolling down the page");
                // Scroll down the page (this part is not implemented in this code)
                robot.keyTap('down');
            } else if (extractFunctionAndQuery(fullResponse).func[i] == "playpause") {
                console.log("Toggling play/pause");
                ks.sendKey('playpause')
                .then(() => console.log('Play/Pause key sent.'))
                .catch(err => console.error('Error:', err));
            } else if (extractFunctionAndQuery(fullResponse).func[i] == "playvideo") { 
                console.log("Playing video for search query:", extractFunctionAndQuery(fullResponse).query[i]);
                const videoSearchQuery = extractFunctionAndQuery(fullResponse).query[i];
                csocket.emit("playVideo", videoSearchQuery);
            }else if (extractFunctionAndQuery(fullResponse).func[i] == "code") { 
                console.log("Paste initiated"); 
                console.log("Pasting code:", extractFunctionAndQuery(fullResponse).query[i]);
                const code = extractFunctionAndQuery(fullResponse).query[i];
                copyPaste.copy(code, function() {
                    console.log('Text copied to clipboard');
                  });
                  
                console.log("Code copied to clipboard:", code);
                // Paste the code into the user's code editor (this part is not implemented in this code)
                // You can use a library like robotjs to simulate pasting the code
                await sleep(1000); // wait for 1 second before pasting
                robot.keyTap('v', 'control');
                
                let myVariable = 3;
            } else if (extractFunctionAndQuery(fullResponse).func[i] == "paste") { 
                console.log("Paste initiated"); 
                console.log("Pasting text", extractFunctionAndQuery(fullResponse).query[i]);
                const code = extractFunctionAndQuery(fullResponse).query[i];
                copyPaste.copy(code, function() {
                    console.log('Text copied to clipboard');
                  });
                  
                console.log("Text copied to clipboard:", code);
                // Paste the code into the user's code editor (this part is not implemented in this code)
                // You can use a library like robotjs to simulate pasting the code
                await sleep(1000); // wait for 1 second before pasting
                robot.keyTap('v', 'control');
                
                let myVariable = 3;
            } else if (extractFunctionAndQuery(fullResponse).func[i] == "performTask") {
                var task = extractFunctionAndQuery(fullResponse).query[i];
                console.log("Performing task:", task);
                await performTask(task);
            }
        
            else {
                console.log("Unknown function:", extractFunctionAndQuery(fullResponse).func[i]);
            }
        }
    

        } else {
                console.log("No function detected in the response.");
                res.write('data: [DONE]\n\n');
                res.end();
            }
        });

        response.data.on('error', (error) => {
            console.error('Stream error:', error);
            res.write('data: [ERROR]\n\n');
            res.end();
        });
    } catch (error) {
        console.error("System Failure. Jarvis not operational.");
        console.error("error details: ", error);
        res.status(500).json({ error: "Failed to process image" });
    }
});

// serve the HTML file for the chat UI
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/ui.html'));
});
// serve the HTML file for the chat UI
app.get('/jarvis', function (req, res) {
    res.sendFile(path.join(__dirname, '/jarvis.html'));
});
app.get('/responder', function (req, res) {
    res.sendFile(path.join(__dirname, '/public/tindex.html'));
});
app.get('/arm', function (req, res) {
    res.sendFile(path.join(__dirname, '/gui.html'));
});
app.get('/slicer', function (req, res) {
    res.sendFile(path.join(__dirname, '/quality.html'));
});
app.get('/test', function (req, res) {
    res.sendFile(path.join(__dirname, '/test.html'));
});

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
var stage = false; 
var replytwo = ""; 
// Function to trigger action in the frontend
async function triggerActionInBackend() {
    console.log('PERSISTENT_TRIGGER_SUCCESSFUL');

    // Send an SSE message to the frontend
    // if the user promtp is necessary, use the prePrompt variable. 
    if (stage == true) {
        console.log("stage is true, sending prompt to evalulator AI");
    csocket.emit("newprompt", `Goal: ${goal[currentNum]} \n First, determine whether the goal is approximately completed or not (if the goal is to turn towards an object and the object is in the center of the image, then the goal is complete).  If the goal is completed, then respond with [COMPLETE]. Because this data will be used to control a robot, the margin of error should be fairly tight. Justify your reasoning for why the goal is or isn't complete before you decide. If anadjustment needs to be made, do not output [COMPLETE] and instead describe the adjustments that should be made. T  If the goal is not completed yet, describe the objects that are relavant to the goal. The description of each object should include a description of: 
        1. How far away it is (in cm) from the camera
        2. How many degrees to the left/right from the center of the camera (be careful to not mix up left and right). Make sure to explain your reasoning to ensure that you do not say an object is to the right if it is actually to the left.. If an object is to the left of the image, you should answer accordingly. 
        Place the description of all the objects in a single set of curly brackets ({}). 
     `);
        stage = false; 
    } else {
        console.log("stage is false, sending prompt to movement AI");
    csocket.emit("newprompt", `Goal: ${goal[currentNum]} \n Enviornment Information: ${replytwo} \n Execute movements in order to achieve the goal based on the enviornment information given.`);
    stage = true; 
    }
}


const clients = [];
// SSE route to send events to the frontend
app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Flush headers to establish the SSE connection

    // Add the client to a list of connected clients
    clients.push(res);

    // Remove the client when the connection is closed
    req.on('close', () => {
        const index = clients.indexOf(res);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    });
});
// Function to broadcast messages to all connected clients
function broadcastToClients(message) {
    clients.forEach(client => {
        client.write(`data: ${message}\n\n`);
    });
}
// create an https server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
require('dotenv').config();
const cheerio = require('cheerio');
const SerpApi = require('google-search-results-nodejs');
const search = new SerpApi.GoogleSearch(process.env.SERPAPI_API_KEY);

async function extractMainContent(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        // optional: helps avoid being blocked
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 7000
    });

    const $ = cheerio.load(html);

    // remove noise
    $('script, style, nav, footer, header, aside').remove();

    const paragraphs = $('p').map((i, el) => $(el).text().trim()).get();
    const content = paragraphs.join('\n').replace(/\n{2,}/g, '\n\n');

    return content.length > 500 ? content.slice(0, 1000) + '...' : content;
  } catch (error) {
    console.error(`Failed to extract content from ${url}:`);
    return 'content could not be extracted.';
  }
}

async function performGoogleSearch(query) {
    console.log("starting search");
  
    return new Promise((resolve, reject) => {
      const params = {
        engine: 'google',
        q: query,
        location: 'United States',
        hl: 'en',
        gl: 'us',
      };
  
      search.json(params, async (data) => {
        if (data && data.organic_results) {
          const topThree = data.organic_results.slice(0, 3);
  
          const resultsWithSummaries = await Promise.all(topThree.map(async (item) => {
            const content = await extractMainContent(item.link);
            return `- ${item.title}: ${item.link}\n  summary: ${content}`;
          }));
  
          resolve(resultsWithSummaries.join('\n\n'));
        } else {
          resolve('no relevant search results found.');
        }
      });
    });
  }