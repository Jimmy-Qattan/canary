/** @type {import("three")} */
const THREE = window.THREE;

const connect = document.getElementById("bluetooth");
const serviceUUID = "36124082-beb0-468d-878d-4e92e1d57754";
const charUUID = "2b1d2fc0-d457-4d7d-bcdc-5dc309b86e1d";

const moveOneServoUUID = "14840e5a-d951-4588-8ec0-7c1af77e31e4";

const txUUID = "424c7441-deb7-41a6-ab07-91838c0ee835";

let encoder = new TextEncoder();

const sendPosesUUID = "8bd3c001-a985-428e-9033-ef4ba970cc52";

const totalStepsServo = 180;
const sliders = Array.from(document.querySelectorAll("input"));
const numberOfServos = 4;

class Pose {
  constructor(angle, duration, isBreak, interpolationType, index) {
    this.angle = angle;
    this.duration = duration;
    this.isBreak = isBreak;
    this.interpolationType = interpolationType;
    this.index = index;
  }
}

window.interps = {
  linear: 0,
  quadratic: 1,
};

window.pose1 = new Pose();
pose1.angle = [10, 10, 10, 10];
pose1.duration = 1000;
pose1.isBreak = false;
pose1.interpolationType = "linear";
pose1.index = 0;

window.poses = [pose1]; // FOR EXAMPLE

const interpMapping = {
  linear: 1,
  quadratic: 2,
  hardquad: 3,
};

window.currentServoPositions = [];
for (let i = 0; i < numberOfServos; i++) {
  currentServoPositions.push(90);
}

import {
  HandLandmarker,
  FilesetResolver,
  ObjectDetector,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

import * as BS from "./brilliantsole/brilliantsole.module.js";

// document.querySelector(".local-transform input").click() Use this bc aframe need

window.jointArray = Array.from(document.querySelectorAll("[rotary]"));
console.log(jointArray);

window.addEventListener("voiceCommand", (event) => {
  switch (event.detail) {
    case "up":
      jointArray[1].object3D.rotation.x -= 0.2;
      break;
    case "down":
      jointArray[1].object3D.rotation.x += 0.2;
      break;
  }
});

window.jointArrayRotations = [
  jointArray[0].object3D.rotation.y,
  jointArray[1].object3D.rotation.y,
  jointArray[2].object3D.rotation.x,
  jointArray[3].object3D.rotation.z,
];

window.radsToDegrees = function (radians) {
  return radians * (180 / Math.PI);
};

const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

window.jointArrayToRoboticsUpdating = true;

window.convertJointArrayToRoboticsDegrees = function (arr) {
  let newArray = [];

  arr.forEach((value, index) => {
    if (index == 2) {
      newArray.push(clamp(Math.trunc(-radsToDegrees(value) + 90), 0, 180));
    } else {
      newArray.push(clamp(Math.trunc(radsToDegrees(value) + 90), 0, 180));
    }
  });

  return newArray;
};

async function connectAndInteract() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [serviceUUID] }],
    });

    const server = await device.gatt.connect();

    const service = await server.getPrimaryService(serviceUUID);

    const characteristic = await service.getCharacteristic(charUUID);

    const moveSingleServoChar =
      await service.getCharacteristic(moveOneServoUUID);

    const txCharacteristic = await service.getCharacteristic(txUUID);
    await txCharacteristic.startNotifications();

    let readyForNextBytePackage = true;

    // await txCharacteristic.startNotifications().then((characteristic) => {

    // });

    const characteristicPoseData =
      await service.getCharacteristic(sendPosesUUID);

    characteristicPoseData.startNotifications();

    //characteristicPoseData.addEventListener("characteristicvaluechanged", modifyCurrentAnimationData);

    const initialVals = await characteristic.readValue();

    const dataByteArray = new Uint8Array(initialVals.buffer);

    let currentlyInAnimation = false;

    let pending = null;
    let running = true;
    let pendingArray = null;
    let writerStarted = false;

    window.moveSingleServo = async (info) => {
      console.log("SENDING" + info);
    };

    window.dispatchEvent(
      new CustomEvent("initializeServos", {
        detail: dataByteArray,
      }),
    );

    window.waitForAck = async () => {
      return new Promise((resolve) => {
        function handler(event) {
          const value = new Uint8Array(event.target.value.buffer)[0];

          if (value === 1) {
            txCharacteristic.removeEventListener(
              "characteristicvaluechanged",
              handler,
            );

            //readyForNextBytePackage = true;
            resolve();
          }
        }

        txCharacteristic.addEventListener(
          "characteristicvaluechanged",
          handler,
        );
      });
    };

    window.sendAnimationData = async (poseArray) => {
      const taskByte = {
        angle: 0,
        duration: 1,
        isBreak: 2,
        interpolationType: 3,
        index: 4,
      };

      for (const poseFrame of poseArray) {
        if (!(poseFrame instanceof Pose)) continue;

        const packets = [];

        for (const [key, value] of Object.entries(poseFrame)) {
          if (value == null) continue;

          const instruction = taskByte[key];

          let lengthOfIncomingData;

          if (Array.isArray(value)) {
            lengthOfIncomingData = value.length;

            packets.push([instruction, lengthOfIncomingData, ...value]);

            console.log([instruction, lengthOfIncomingData, ...value]);
          } else if (key === "interpolationType") {
            packets.push([instruction, 1, interps[value]]);

            console.log([instruction, 1, interps[value]]);
          } else {
            packets.push([instruction, 1, value]);

            console.log([instruction, 1, value]);
          }
        }

        for (const packet of packets) {
          console.log("Sending packet:", packet);

          const ackPromise = waitForAck();

          const dataView = new DataView(new ArrayBuffer(2 * packet.length - 1));
          let byteOffset = 0;
          packet.forEach((value, index) => {
            if (index == 0) {
              dataView.setUint8(byteOffset, value);
              byteOffset++;
            } else {
              dataView.setUint16(byteOffset, value, true);
              byteOffset += 2;
            }
          });

          await characteristicPoseData.writeValue(dataView.buffer);
          console.log("hmmm. Sending from dataview");

          await ackPromise;
        }
      }
    };

    window.bleWriterLoop = async (nums) => {
      while (true) {
        if (pendingArray) {
          const data = pendingArray;
          //pendingArray = null;

          try {
            if (characteristic.properties.writeWithoutResponse) {
              characteristic.writeValueWithoutResponse(data);
            } else {
              await characteristic.writeValue(data);
            }

            currentServoPositions = Array.from(data);

            for (let i = 0; i < currentServoPositions.length; i++) {
              currentServoPositions[i] = Math.floor(currentServoPositions[i]);
            }

            pendingArray = null;

            console.log("Writing from writer loop");
          } catch (e) {
            console.error("BLE write failed", e);
          }

          //console.log(`${data[0]} is the vals`);
        }

        // BLE pacing — REQUIRED
        await new Promise((r) => setTimeout(r, 10)); // ~30Hz
      }
    };

    // window.writeValue = async (numbers) => {
    //   const array = Uint8Array.from(numbers);
    //   await characteristic.writeValue(array);
    //   return array;
    // };

    window.addAngle = (angle, direction = "") => {
      switch (direction) {
        case "left":
          writeValueAdd([Math.abs(angle), 0, 0, 0]);
          break;
        case "right":
          writeValueAdd([-Math.abs(angle), 0, 0, 0]);
          break;
        case "neutralTorso":
          writeValueAdd([angle, 0, 0, 0]);
          break;
        case "up":
          writeValueAdd([0, 0, -Math.abs(angle), 0]);
          break;
        case "down":
          writeValueAdd([0, 0, Math.abs(angle), 0]);
          break;
        case "neutralUpper":
          writeValueAdd([0, 0, angle, 0]);
          break;
        default:
          writeValueAdd([0, 0, 0, 30]);
          window.setTimeout(function () {
            writeValueAdd([0, 0, 0, -30]);
          }, 2000);
      }
    };

    window.setTiltAngle = (angle) => {
      currentServoPositions[3] = -Math.abs(angle) + 90;
      writeValue(currentServoPositions);
    };

    window.addTiltAngle = (angle, direction = "right") => {
      switch (direction) {
        case "right":
          writeValueAdd([0, 0, 0, Math.abs(angle)]);
          break;
        case "left":
          writeValueAdd([0, 0, 0, -Math.abs(angle)]);
          break;
        default:
          writeValueAdd([0, 0, 0, Math.abs(angle)]);
      }
    };

    window.setAngleTorso = (angle, direction = "") => {
      switch (direction) {
        case "up":
          currentServoPositions[2] = -Math.abs(angle) + 90;
          break;
        case "down":
          currentServoPositions[2] = Math.abs(angle) + 90;
          break;
        default:
          currentServoPositions[2] = -angle;
      }

      writeValue(currentServoPositions);
    };

    window.setAngle = (angle, relativeToForward = true) => {
      if (relativeToForward) {
        currentServoPositions[0] = angle + 90;
      } else {
        currentServoPositions[0] = angle;
      }

      writeValue(currentServoPositions);
    };

    window.modulateValue = (
      arr = currentServoPositions,
      threshold = [45, 135],
    ) => {
      if (!arr) throw new Error("Array must be passed into modulateValue");
      if ((!threshold) instanceof Array || threshold.length != 2)
        throw new Error(
          "Threshold Array must be an Array with left and right bounds",
        );

      let newArr = []; // To place new modulated values in

      const [leftBound, rightBound] = threshold;
      let [servo1, servo2, servo3, servo4] = arr;

      let intervalToMove;

      if (servo1 <= leftBound) {
        intervalToMove = leftBound - servo1;
        servo1 = leftBound;

        if (servo2 - intervalToMove >= 0) {
          servo2 -= intervalToMove;
        } else {
          servo2 = 0;
          throw new Error(
            "Servo 2 set to ZERO since servo 2 demands to be negative: " +
              servo2,
          );
        }
      } else if (servo1 >= rightBound) {
        intervalToMove = servo1 - rightBound;
        servo1 = rightBound;

        if (servo2 + intervalToMove <= 180) {
          servo2 += intervalToMove;
        } else {
          servo2 = 180;
          throw new Error(
            "Servo 2 set to 180 since servo 2 demands to go over the servo threshold: " +
              servo2,
          );
        }
      }

      /**
       
        - Check the bounds of the currentServoPositions[0] to see if it is on the left or right bound exactly with.
        - If the outofBound is from the left side, check if the currentServoPositions[1] < 90
        - If the outofBound is from the right side,  check if the currentServoPositions[1] > 90

      **/

      const defaultValue = 90;
      let checkBounds = checkRange(servo1, threshold);
      //checkBounds Gives some weird outputs

      if (checkBounds.direction == "onLeft") {
        if (servo2 > 90) {
          const difference = servo2 - 90;
          servo1 += difference;
          servo2 = defaultValue;
        }
      } else if (checkBounds.direction == "onRight") {
        if (servo2 < 90) {
          const difference = 90 - servo2;
          servo1 -= difference;
          servo2 = defaultValue;
        }
      }

      newArr = [
        Math.round(servo1),
        Math.round(servo2),
        Math.round(servo3),
        Math.round(servo4),
      ];
      return newArr;
    };

    window.checkRange = (value, threshold = [45, 135]) => {
      if (value < threshold[0]) {
        return {
          outOfBounds: true,
          direction: "left",
          magnitude: Math.abs(value - threshold[0]),
        };
      } else if (value > threshold[1]) {
        return {
          outOfBounds: true,
          direction: "right",
          magnitude: Math.abs(value - threshold[1]),
        };
      } else {
        if (value == threshold[0]) {
          return {
            outOfBounds: null,
            direction: "onLeft",
            magnitude: threshold[0],
          };
        } else if (value == threshold[1]) {
          return {
            outOfBounds: null,
            direction: "onRight",
            magnitude: threshold[1],
          };
        } else {
          return { outOfBounds: false, direction: "", magnitude: null };
        }
      }
    };

    window.writeValueAdd = async (numbers) => {
      /** 
        
        Step 1: if the currentServoPositions[0] is in bounds, just add the numbers[0] to the currentServoPositions[0]
          if the currentServoPositions is right on the bounds (checkRange(currentServoPositions[0]).direction == "onLeft" or "onRight") then add currentServoPositions[0] + numbers[0]

      
        **/

      let finalArray = [...currentServoPositions];
      let threshold = [0, 180];

      if (checkRange(currentServoPositions[0]).outOfBounds == false) {
        finalArray[0] += numbers[0];
      } else if (checkRange(currentServoPositions[0]).outOfBounds == null) {
        finalArray[1] += numbers[0];
      }

      for (let i = 2; i < finalArray.length - 1; i++) {
        let boundsCheck = checkRange(finalArray[i] + numbers[i], threshold);
        if (boundsCheck.outOfBounds == true) {
          if (boundsCheck.direction == "left") {
            finalArray[i] = threshold[0];
          } else if (boundsCheck.direction == "right") {
            finalArray[i] = threshold[1];
          }
        } else {
          finalArray[i] += numbers[i];
        }
      }

      // let finalArray = currentServoPositions.map((num, i) => {
      //   if (
      //     num + Math.ceil(numbers[i]) <= 180 &&
      //     num + Math.ceil(numbers[i]) >= 0
      //   ) {
      //     return num + Math.floor(numbers[i]);
      //   } else if (num + Math.floor(numbers[i]) > 180) {
      //     return 180;
      //   } else if (num + Math.floor(numbers[i]) < 0) {
      //     return 0;
      //   }
      // });

      writeValue(modulateValue(finalArray));
    };

    window.writeJointArrayValues = async (jointArrayValues) => {
      const jointArrayRotations = Uint8Array.from(
        convertJointArrayToRoboticsDegrees([
          jointArrayValues[0].object3D.rotation.y,
          jointArrayValues[1].object3D.rotation.y,
          jointArrayValues[2].object3D.rotation.x,
          jointArrayValues[3].object3D.rotation.z,
        ]),
      );

      pendingArray = Uint8Array.from(jointArrayRotations);

      console.log(pendingArray);

      if (!writerStarted) {
        writerStarted = true;
        //console.log(numbers);
        bleWriterLoop(pendingArray);
      }

      return pendingArray;

      //console.log(convertJointArrayToRoboticsDegrees(jointArrayRotations));
    };

    window.writeValue = async (numbers) => {
      // Store latest data ONLY
      pendingArray = Uint8Array.from(numbers);

      // Start writer loop once
      if (!writerStarted) {
        writerStarted = true;
        //console.log(numbers);
        bleWriterLoop(Uint8Array.from(modulateValue(pendingArray)));
      }

      return pendingArray;
    };

    window.animationRunning = () => {
      return currentlyInAnimation;
    };

    window.writeValueWithTiming = async (
      initialPos,
      finalPos,
      time,
      interp = "linear",
    ) => {
      if (currentlyInAnimation) return new Error("Currently in an animation");

      let counter = 0;
      let interpolation = 0;

      let differences = [];

      if (
        !(initialPos instanceof Array) ||
        !(initialPos.length != finalPos.length) ||
        !(finalPos instanceof Array)
      )
        return new Error(
          "initialPos must be an array, finalPos must be an array, lengths of arrays must match",
        );

      initialPos.forEach((pos, i) => {
        differences.push(finalPos[i] - initialPos[i]);
      });

      currentlyInAnimation = true;

      const interval = window.setInterval(() => {
        if (counter < time) {
          // Create interpolation to move servos accordingly
          interpolation = counter / time;
          counter++;
        } else {
          console.log("Pose has been reached");
          currentlyInAnimation = false;
          clearInterval(interval);
        }

        const newValues = [];

        switch (interp) {
          case "linear":
            // CHECK OVER
            initialPos.forEach((val, i) => {
              newValues.push(Math.floor(differences[i] * interpolation + val));
            });

            console.log(newValues, " new values for animation for linear");

            writeValue(Uint8Array.from(newValues));

            break;
          case "quadratic":
            // CHECK OVER
            initialPos.forEach((val, i) => {
              newValues.push(
                Math.floor(differences[i] * Math.pow(interpolation, 2) + val),
              );
            });

            console.log(newValues, " new values for animation for quadratic");

            writeValue(Uint8Array.from(newValues));

            break;
          case "exponential":
            break;
          default:
        }
      }, 1);
    };

    window.lookAround = async (speed) => {
      // Look around accordingly

      switch (speed) {
        case 0:
          break;
        case 1:
          break;
        case 2:
          break;
        case 3:
          break;
        default:
      }
    };

    //window.writeValue = throttler(window.writeValue, 10);
    console.log("connected");
  } catch (error) {
    console.error(error);
  }
}

function sendRotationBytesDEMAND(array, totalStepsServo) {
  let newRotArray = []; // To be built upon

  if (
    array instanceof Array &&
    typeof totalStepsServo == "number" &&
    totalStepsServo > 0
  ) {
    array.forEach((value) => {
      newRotArray.push(Math.trunc(180 * (value / totalStepsServo)));
    });

    return newRotArray;
  } else {
    if (!(array instanceof Array)) {
      throw new Error("First parameter must be an array of integers");
    } else if (typeof totalStepsServo != "number") {
      throw new Error("Steps per servo must be an integer");
    } else if (totalStepsServo <= 0) {
      throw new Error("Steps per servo must be a NON ZERO POSITIVE value");
    }
  }
}

let values = [];

function throttler(callerFunction, interval) {
  let beginningTime = 0;
  return (...args) => {
    let now = Date.now();
    if (now - beginningTime >= interval) {
      callerFunction(...args);
      beginningTime = now;
    }
  };
}

// sliders.forEach((slider) => {
//   slider.addEventListener("input", function () {

//     currentServoPositions[sliders.indexOf(this)] = Number(this.value);

//     console.log("aha!");

//     writeValue(sendRotationBytesDEMAND(currentServoPositions, totalStepsServo));
//   });
// });

connect.addEventListener("click", () => {
  let returnedVal = connectAndInteract(numberOfServos, currentServoPositions);
  console.log(returnedVal);
});

window.addEventListener("initializeServos", (event) => {
  const rotArray = event.detail;

  console.log(rotArray);
});

// MEDIAPIPE

let handLandmarker, objectDetection;

function detectObjectRecognitionLoop(detector, video) {
  const results = detector.detectForVideo(video, performance.now());

  if (results.detections.length > 0) {
    results.detections.forEach((detection) => {
      const name = detection.categories[0].categoryName;

      const box = detection.boundingBox;

      const x = box.originX;
      const y = box.originY;

      if (name == "person") {
        console.log("person detected");
        window.dispatchEvent(
          new CustomEvent("personDetected", {
            detail: new THREE.Vector2(x, y),
          }),
        );
      } else if (name == "cell phone") {
        console.log("Phone! Phone!");
        window.dispatchEvent(
          new CustomEvent("phoneDetected", { detail: new THREE.Vector2(x, y) }),
        );
      } else {
        console.log("Other found: " + name);
      }

      // console.log("Object:", name);
      // console.log("Position:", x, y);
      // console.log("------");
    });
  }
}

function detectHandLandmarker(media) {
  let results = handLandmarker.detectForVideo(media, performance.now());

  if (results.landmarks.length > 0) {
    if (results.landmarks.length == 1) {
      results.landmarks[0].forEach((value) => {
        value.x *= -1;
        value.x++;

        value.y *= -1;
        value.y++;
      });
    } else {
      results.landmarks.forEach((hand) => {
        hand.forEach((point) => {
          point.x *= -1;
          point.x++;

          point.y *= -1;
          point.y++;
        });
      });
    }
    window.dispatchEvent(
      new CustomEvent("landmarkData", { detail: results.landmarks }),
    );
  }
}
async function startVideo() {
  let stream = await navigator?.mediaDevices?.getUserMedia({
    video: true,
  });
  video.srcObject = stream;

  video.addEventListener("loadeddata", () => {
    console.log("Video ready:", video.videoWidth, video.videoHeight);

    function loop() {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        requestAnimationFrame(loop);
        console.log("ERROR");
        return;
      }

      console.log("WOKING WORKING");

      detectObjectRecognitionLoop(objectDetection, video);

      detectHandLandmarker(video);

      requestAnimationFrame(loop);
    }

    loop();
  });
}

async function loadRecognitionLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });

  objectDetection = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
    },
    scoreThreshold: 0.3,
    runningMode: "image",
  });

  console.log(objectDetection, "here");

  console.log("Object Detection and Hand Tracking Successful");
}

const handBox = document.querySelectorAll("[hand]")[0];

let sensitivity = 50;

const pinchThreshold = 0.15;
let isPinching = false;

let vectorMathStarted = false;
let finalHandVel, initialHandVel;
let insAccelerationOfHand;
let startVector = new THREE.Vector2(0, 0);
let finalVector = new THREE.Vector2(0, 0);

let xVel, yVel;
let velocityVectorFinal = new THREE.Vector2(0, 0);
let velocityVectorInitial = new THREE.Vector2(0, 0);
let deltaVelocity = new THREE.Vector2(0, 0);
let accelerationVector = new THREE.Vector2(0, 0);

let deltaX, deltaY;

let thumbTipVector = new THREE.Vector2(0, 0);
let pointerTipVector = new THREE.Vector2(0, 0);

let startTime, finalTime, timeDelta;

const physicsInterval = 10;

const velocityThreshold = 0.5;
const accelThreshold = 0.028;

const speedMultiplier = 500;

let frameReady = false;

let idleMode = false;

const vectorMultiplier = 2000;

// BIG VARIABLE!
let isFollowingHand = true;

let accelRestored = true;
const accelRestorationTime = 3000;
let currentAccelRestoreTime = 0;

window.setInterval(function () {
  if (!accelRestored) {
    currentAccelRestoreTime += physicsInterval;
  }

  if (currentAccelRestoreTime >= accelRestorationTime) {
    accelRestored = true;
    currentAccelRestoreTime = 0;
  }

  if (!frameReady) return;
  frameReady = !frameReady;

  const displacement = new THREE.Vector2(
    finalVector.x - startVector.x,
    finalVector.y - startVector.y,
  );

  timeDelta = finalTime - startTime;
  deltaX = displacement.x;
  deltaY = displacement.y;

  xVel = deltaX / timeDelta;
  yVel = deltaY / timeDelta;

  velocityVectorFinal.set(xVel, yVel);

  const posVector = new THREE.Vector2(finalVector.x - 0.5, finalVector.y - 0.5);

  window.dispatchEvent(
    new CustomEvent("positionData", {
      detail: {
        vector: posVector,
        magnitude: posVector.length(),
      },
    }),
  );

  if (vectorMathStarted) {
    finalHandVel =
      (startVector.distanceTo(finalVector) / timeDelta) * speedMultiplier;
    startVector.copy(finalVector);

    deltaVelocity.set(
      velocityVectorFinal.x - velocityVectorInitial.x,
      velocityVectorFinal.y - velocityVectorInitial.y,
    );

    if (!initialHandVel) {
      initialHandVel = finalHandVel;
      insAccelerationOfHand = 0;
      accelerationVector.set(0, 0);
    } else {
      velocityVectorInitial.copy(velocityVectorFinal);
      accelerationVector.set(
        deltaVelocity.x / timeDelta,
        deltaVelocity.y / timeDelta,
      );
    }

    if (
      Math.abs(velocityVectorFinal.length()) * speedMultiplier >=
      velocityThreshold
    ) {
      // PERFORM A TASK UPON A CERTAIN VELOCITY
      if (deltaX && deltaY) {
        window.dispatchEvent(
          new CustomEvent("velocityThresholdReached", {
            detail: {
              velocity: velocityVectorFinal.length(),
              displacementVector: velocityVectorFinal,
            },
          }),
        );

        console.log("FAST!");
      }
    }

    if (
      Math.abs(accelerationVector.length()) * speedMultiplier >=
        accelThreshold &&
      accelRestored &&
      isFinite(accelerationVector.length())
    ) {
      // PERFORM A TASK UPON A CERTAIN ACCELERATION
      window.dispatchEvent(
        new CustomEvent("accelerationThresholdReached", {
          detail: {
            acceleration: accelerationVector.length() * speedMultiplier,
            displacementVector: accelerationVector,
          },
        }),
      );
      //console.log("HIT");
      document.getElementById("hit").innerHTML =
        `${accelerationVector.length() * speedMultiplier}`;
      window.setTimeout(() => {
        document.getElementById("hit").innerHTML = "Idle";
      }, 1000);

      accelRestored = false;
      currentAccelRestoreTime = 0;
    }

    window.dispatchEvent(
      new CustomEvent("velocityData", {
        detail: {
          vector: new THREE.Vector2(
            velocityVectorFinal.x * speedMultiplier,
            velocityVectorFinal.y * speedMultiplier,
          ),
          magnitude: velocityVectorFinal.length() * speedMultiplier,
        },
      }),
    );

    window.dispatchEvent(
      new CustomEvent("accelerationData", {
        detail: {
          vector: new THREE.Vector2(
            accelerationVector.x * speedMultiplier,
            accelerationVector.y * speedMultiplier,
          ),
          magnitude: accelerationVector.length() * speedMultiplier,
        },
      }),
    );

    //console.log(finalHandVel, insAccelerationOfHand);

    velocityVectorInitial.copy(velocityVectorFinal);
    startTime = performance.now();
  }
}, physicsInterval);

window.addEventListener("landmarkData", (data) => {
  const handXVal = data.detail[0][9].x - 0.5;
  const handYVal = data.detail[0][9].y - 0.5;

  const vec = new THREE.Vector2(handXVal, handYVal);

  const changeInXValue = handXVal * (sensitivity * vec.length());
  const changeInYValue = handYVal * (sensitivity * vec.length());

  thumbTipVector = new THREE.Vector2(data.detail[0][4].x, data.detail[0][4].y);
  pointerTipVector = new THREE.Vector2(
    data.detail[0][8].x,
    data.detail[0][8].y,
  );

  if (thumbTipVector.distanceTo(pointerTipVector) <= pinchThreshold) {
    isPinching = true;
  } else {
    isPinching = false;
  }

  if (!vectorMathStarted) {
    startVector.copy(pointerTipVector);
    console.log(
      "START. Current vector updated to x: " +
        startVector.x +
        " and y: " +
        startVector.y +
        ". NO VELOCITY CALCULATED",
    );
    vectorMathStarted = true;
    startTime = performance.now();
    finalTime = startTime;
  } else {
    finalVector.copy(pointerTipVector);

    finalTime = performance.now();
    // insVelocityOfHand = startVector.distanceTo(finalVector);
    // startVector.copy(finalVector);
    //console.log("INSTANTANEOUS VELOCITY OF HAND: " + insVelocityOfHand);
  }

  frameReady = true;

  let servoPos1 = currentServoPositions[0]; // + handXVal * (sensitivity * vec.length()); // Servo position of servo 1

  let servoPos1Above = currentServoPositions[1];

  let servoPos2 = currentServoPositions[2] + changeInYValue; // Servo position of servo 3

  if (vec.length() >= 0.05 && isPinching && isFollowingHand) {
    if (
      servoPos1 >= 0 &&
      servoPos1 < 180 &&
      servoPos2 >= 0 &&
      servoPos2 < 180
    ) {
      // If the servo value of very bottom servo is less than 45, start to change value of the servo above.

      if (currentServoPositions[0] <= 45) {
        if (
          servoPos1Above + changeInXValue <= 90 &&
          servoPos1Above + changeInXValue >= 0
        ) {
          servoPos1Above = currentServoPositions[1] + changeInXValue;
        } else {
          servoPos1 = currentServoPositions[0] + changeInXValue;
          servoPos1Above = 90;
        }
      } else if (currentServoPositions[0] >= 135) {
        if (
          servoPos1Above + changeInXValue >= 90 &&
          servoPos1Above + changeInXValue <= 180
        ) {
          servoPos1Above = currentServoPositions[1] + changeInXValue;
        } else {
          servoPos1 = currentServoPositions[0] + changeInXValue;
          servoPos1Above = 90;
        }
      } else {
        servoPos1 = currentServoPositions[0] + changeInXValue;
        servoPos1Above = 90;
      }

      //writeValue([Math.floor(servoPos1), 90, Math.floor(servoPos2), 90]);
      if (typeof writeValue === "function") {
        writeValue([
          Math.floor(servoPos1),
          servoPos1Above,
          Math.floor(servoPos2),
          90,
        ]);
      }
    }
  }

  //console.log(servoPos1, servoPos2);
  //console.log(currentServoPositions);
});

const bsDevice = new BS.Device();
const toggleBSConnectionButton = document.getElementById("toggleBSConnection");
toggleBSConnectionButton.addEventListener("click", () => {
  bsDevice.toggleConnection();
});
bsDevice.addEventListener("connectionStatus", () => {
  let innerText = bsDevice.connectionStatus;
  switch (bsDevice.connectionStatus) {
    case "notConnected":
      innerText = "connect";
      break;
    case "connected":
      innerText = "disconnect";
      break;
  }
  toggleBSConnectionButton.innerText = innerText;
});

bsDevice.addEventListener("connected", async () => {
  await bsDevice.setCameraConfiguration({ resolution: 200, qualityFactor: 60 });
  bsDevice.autoPicture = true;
  bsDevice.takePicture();
});

/** @type {HTMLImageElement} */
const cameraImage = document.getElementById("cameraImage");
bsDevice.addEventListener("cameraImage", (event) => {
  cameraImage.src = event.message.url;
});
cameraImage.addEventListener("load", () => {
  detectHandLandmarker(cameraImage);
  detectObjectRecognitionLoop(objectDetection, cameraImage);
});

loadRecognitionLandmarker();
//startVideo();

// window.addEventListener("load", () => {
//   document.querySelectorAll("[data-servo]").forEach((element) => {
//     element.setAttribute("rotation-listener", "axis: x");
//   });
// });

const scene = document.querySelector("a-scene");
console.log(scene);
scene.addEventListener("rotationChanged", (event) => {
  const { entity, angle, axis } = event.detail;
  const servoIndex = +entity.dataset.servo;
  console.log({ angle, axis, servoIndex }, entity);
  console.log("Servo index: " + servoIndex);

  if (servoIndex == 2) {
    const val = clamp(Math.trunc(-angle + 90), 0, 180);
    moveSingleServo(val);
    console.log(val);
  } else {
    const val = clamp(Math.trunc(angle + 90), 0, 180);
    moveSingleServo(val);
  }

  // Now ot create a function that writes to one individual servo.
});

const sceneEl = document.querySelector("a-scene");

const enableAframe = document.getElementById("enableAframe");

enableAframe?.addEventListener("click", () => {
  if (scene.style.display === "none") {
    scene.style.display = "block";
    enableAframe.innerHTML = "Hide A-frame";
  } else {
    scene.style.display = "none";
    enableAframe.innerHTML = "Open A-frame";
  }
});

const moveSensativity = 40;

window.addEventListener("voiceCommand", function (event) {
  if (typeof addAngle != "function") return;

  addAngle(moveSensativity, event.detail);
});

const controllerSensitivityEl = document.getElementById(
  "controllerSensitivity",
);
const sensitivityText = document.getElementById("sensitivityText");
sensitivityText.innerHTML = `Adjust Controller Sensitivity: ${controllerSensitivityEl.value}`;

let controllerSensitivity = 50;

controllerSensitivityEl.addEventListener("input", () => {
  controllerSensitivity = controllerSensitivityEl.value;
  sensitivityText.innerHTML = `Adjust Controller Sensitivity: ${controllerSensitivity}`;
});

window.addEventListener("controllerAxis", function (event) {
  if (
    typeof addAngle != "function" ||
    controllerSensitivity == null ||
    event.zero == true
  )
    return;

  console.log("now");

  const axis1 = event.detail.axis[0];
  const axis2 = event.detail.axis[1];

  if (axis1.x != 0) {
    addAngle(axis1.x * (controllerSensitivity / 50), "neutralTorso");
  }

  if (axis2.y != 0) {
    addAngle(axis2.y * (controllerSensitivity / 10), "neutralUpper");
  }
});

window.addEventListener("controllerButton", (event) => {
  if (typeof addTiltAngle != "function") return;
  if (event.detail?.button == "leftTrigger") {
    addTiltAngle((controllerSensitivity / 100) * 70, "left");
  } else if (event.detail?.button == "rightTrigger") {
    addTiltAngle((controllerSensitivity / 100) * 70, "right");
  }
});
