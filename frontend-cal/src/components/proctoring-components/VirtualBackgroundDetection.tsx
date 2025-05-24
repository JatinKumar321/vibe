import React, { useEffect, useState, useRef } from "react";

const VirtualBackgroundDetection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [background, setBackground] = useState<string | null>(null);

  useEffect(() => {
    // Initialize the worker
    workerRef.current = new Worker(
      new URL("../../workers/virtualBackground.worker.ts", import.meta.url),
      { type: "module" }
    );

    // Setup message handling from worker
    workerRef.current.onmessage = (event: MessageEvent) => {
      const { type, error } = event.data;
      switch (type) {
        case "worker_ready":
          console.log("Worker is ready. Requesting model load...");
          workerRef.current?.postMessage({
            type: "load_model",
            modelPath: "src/models/model.tflite", // Adjust if necessary
          });
          break;
        case "model_loaded":
          console.log("Model loaded successfully by worker.");
          // Optionally, set a state here like setIsWorkerReady(true) if needed for interval useEffect dependency
          break;
        case "model_error":
          console.error("Error loading model in worker:", error);
          break;
        case "inference_result":
          setBackground(event.data.background);
          break;
        case "inference_error":
          console.error("Error during inference in worker:", error);
          break;
        default:
          console.log("Received unknown message from worker:", event.data);
      }
    };

    const startWebcam = async () => {
      const video = videoRef.current;
      if (
        video &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      ) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            console.log("Webcam started and playing.");
          };
        } catch (err) {
          console.error("Error starting webcam: ", err);
        }
      }
    };

    startWebcam();

    // Cleanup function
    return () => {
      workerRef.current?.terminate();
      console.log("Worker terminated.");
    };
  }, []); // Empty dependency array ensures this runs once on mount

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !workerRef.current) return; // Wait for video and worker

    const requestInference = () => {
      if (
        video.readyState === 4 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        // Create a temporary canvas to get ImageData
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          console.error("Canvas context for inference is not available.");
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Post ImageData to the worker, transferring ownership of the ArrayBuffer
        workerRef.current?.postMessage(
          { type: "run_inference", imageData: imageData },
          [imageData.data.buffer]
        );
      }
    };

    const intervalId = setInterval(requestInference, 5000); // Run every 5 seconds

    return () => clearInterval(intervalId); // Cleanup on component unmount or when dependencies change
  }, [workerRef.current]); // Rerun if workerRef.current changes (though it shouldn't after init)

  return (
    <div>
      <video
        ref={videoRef}
        style={{ display: "none" }}
        playsInline
        autoPlay
        muted
      />
      <h4>Background: {background !== null ? background : "Detecting..."}</h4>
    </div>
  );
};

export default VirtualBackgroundDetection;
