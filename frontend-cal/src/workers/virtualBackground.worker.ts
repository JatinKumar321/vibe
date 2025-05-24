// frontend-cal/src/workers/virtualBackground.worker.ts

import * as tf from '@tensorflow/tfjs';
import * as tflite from '@tensorflow/tfjs-tflite';

// Set TFLite WASM path
// IMPORTANT: This path assumes that the TFLite WASM files from
// 'node_modules/@tensorflow/tfjs-tflite/dist/' have been copied
// to a top-level directory named 'tflite-wasm-assets' in your public/static assets folder.
// You may need to adjust this path based on your project's build process and how static assets are served.
tflite.setWasmPath('/tflite-wasm-assets/');

// Type Definitions
export type PixelValue = number; // 0-255
export type ImageChannel = PixelValue[][]; // Represents a single color channel (e.g., R, G, or B)
export type ImageFrame = [ImageChannel, ImageChannel, ImageChannel]; // Represents [R, G, B] channels

// Co-occurrence Matrix: 256x256 matrix for each channel pair or intra-channel
export type CoOccurrenceMatrix = number[][];

// Core Logic Functions
function splitChannels(imageData: ImageData): ImageFrame {
  const { data, width, height } = imageData;
  const rChannel: ImageChannel = [];
  const gChannel: ImageChannel = [];
  const bChannel: ImageChannel = [];

  for (let y = 0; y < height; y++) {
    rChannel[y] = [];
    gChannel[y] = [];
    bChannel[y] = [];
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      rChannel[y][x] = data[index];
      gChannel[y][x] = data[index + 1];
      bChannel[y][x] = data[index + 2];
    }
  }
  return [rChannel, gChannel, bChannel];
}

function intraChannelCooccurrence(channel: ImageChannel, width: number, height: number): CoOccurrenceMatrix {
  const matrix: CoOccurrenceMatrix = Array(256).fill(null).map(() => Array(256).fill(0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) { // Horizontal adjacency
      matrix[channel[y][x]][channel[y][x+1]]++;
    }
  }
  // Normalize? (Original code did not explicitly normalize here, TBD if needed for model)
  return matrix;
}

function interChannelCooccurrence(channel1: ImageChannel, channel2: ImageChannel, width: number, height: number): CoOccurrenceMatrix {
  const matrix: CoOccurrenceMatrix = Array(256).fill(null).map(() => Array(256).fill(0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      matrix[channel1[y][x]][channel2[y][x]]++;
    }
  }
  // Normalize?
  return matrix;
}

function getSixCoMat(frame: ImageFrame, width: number, height: number): CoOccurrenceMatrix[] {
  const [rChannel, gChannel, bChannel] = frame;

  const rrMatrix = intraChannelCooccurrence(rChannel, width, height);
  const ggMatrix = intraChannelCooccurrence(gChannel, width, height);
  const bbMatrix = intraChannelCooccurrence(bChannel, width, height);

  const rgMatrix = interChannelCooccurrence(rChannel, gChannel, width, height);
  const rbMatrix = interChannelCooccurrence(rChannel, bChannel, width, height);
  const gbMatrix = interChannelCooccurrence(gChannel, bChannel, width, height);

  return [rrMatrix, ggMatrix, bbMatrix, rgMatrix, rbMatrix, gbMatrix];
}

// Modified captureFrame (renamed to processImageData)
function processImageData(imageData: ImageData): ImageFrame {
  // The splitChannels function already does the conversion from ImageData to ImageFrame
  return splitChannels(imageData);
}

// Model Loading and Inference Logic
let model: tflite.TFLiteModel | null = null;

async function loadModel(modelPath: string) {
  try {
    model = await tflite.loadTFLiteModel(modelPath);
    self.postMessage({ type: 'model_loaded' });
    console.log('Model loaded successfully');
  } catch (error) {
    console.error('Error loading model:', error);
    self.postMessage({ type: 'model_error', error: error });
  }
}

async function runInference(imageData: ImageData) {
  if (!model) {
    self.postMessage({ type: 'inference_error', error: 'Model not loaded' });
    return;
  }

  const { width, height } = imageData;
  const frame = processImageData(imageData); // This is already ImageFrame
  const coOccurrenceMatrices = getSixCoMat(frame, width, height);

  // Flatten and prepare input for the model
  // Assuming the model expects a flat array or a specific tensor shape.
  // This part needs to be aligned with the actual model's input requirements.
  // For now, let's flatten all co-occurrence matrices into a single array.
  const flatFeatures = coOccurrenceMatrices.reduce((acc, matrix) => {
    matrix.forEach(row => acc.push(...row));
    return acc;
  }, [] as number[]);

  // Example: Create a 1D tensor. Adjust shape as per your model's requirements.
  // The model might expect a [1, N] or [N] shape, where N is the total number of features.
  // Or it might expect a specific 3D shape like [1, num_matrices, 256*256]
  // Or even a 4D shape [1, 6, 256, 256] if each matrix is an input "channel"
  
  // For demonstration, let's assume the model expects a 1D tensor of all features.
  // The exact size would be 6 * 256 * 256 = 393216
  // And the model expects a shape like [1, 393216]

  let inputTensor;
  try {
    // Ensure all values are numbers, replace NaNs or Infs if necessary
    const cleanedFeatures = flatFeatures.map(v => (Number.isFinite(v) ? v : 0));
    inputTensor = tf.tensor2d([cleanedFeatures], [1, cleanedFeatures.length], 'float32');

    // Run inference
    const outputTensor = model.predict(inputTensor) as tf.Tensor;
    const outputData = await outputTensor.data();

    // Process output tensor
    // This depends on your model's output.
    // Assuming a binary classification (Virtual vs. Real) with a single output value.
    // e.g., outputData[0] > 0.5 means "Virtual"
    const prediction = outputData[0] > 0.5 ? 'Virtual' : 'Real'; // Example threshold

    self.postMessage({ type: 'inference_result', background: prediction });

    // Clean up tensors
    inputTensor.dispose();
    outputTensor.dispose();

  } catch (error) {
    console.error('Error during inference:', error);
    self.postMessage({ type: 'inference_error', error: error });
    if (inputTensor) inputTensor.dispose(); // Clean up input tensor on error too
  }
}

// onmessage Handler
self.onmessage = async (event: MessageEvent) => {
  const { type, modelPath, imageData } = event.data;

  if (type === 'load_model' && modelPath) {
    await loadModel(modelPath);
  } else if (type === 'run_inference' && imageData) {
    await runInference(imageData);
  }
};

// Initial Model Load Trigger
self.postMessage({ type: 'worker_ready' });
