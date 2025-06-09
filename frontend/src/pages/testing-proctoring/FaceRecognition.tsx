import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

interface FaceRecognitionProps {
  videoElement: HTMLVideoElement | null;
  modelsLoaded: boolean;
  labeledDescriptors: faceapi.LabeledFaceDescriptors[] | null;
}

const FaceRecognition: React.FC<FaceRecognitionProps> = ({ 
  videoElement, 
  modelsLoaded, 
  labeledDescriptors 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderDimensions, setRenderDimensions] = useState({ width: 640, height: 480 });
  const [faceMatcher, setFaceMatcher] = useState<faceapi.FaceMatcher | null>(null);

  const isDetectingActiveRef = useRef(false);
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const currentDisplaySizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (labeledDescriptors && labeledDescriptors.length > 0) {
      console.log('Creating FaceMatcher with descriptors:', labeledDescriptors.length);
      const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6); // 0.6 is the distance threshold
      setFaceMatcher(matcher);
    } else {
      console.warn('No labeled descriptors available to create FaceMatcher.');
      setFaceMatcher(null);
    }
  }, [labeledDescriptors]);

  useEffect(() => {
    if (!videoElement || !modelsLoaded || !canvasRef.current) {
      console.log('FaceRecognition: Video element, models, or canvas not ready.');
      // Ensure cleanup runs if we return early after being initialized once
      if (isDetectingActiveRef.current) {
        isDetectingActiveRef.current = false;
        if (canvasContextRef.current && currentDisplaySizeRef.current.width > 0) {
          canvasContextRef.current.clearRect(0, 0, currentDisplaySizeRef.current.width, currentDisplaySizeRef.current.height);
        }
      }
      return;
    }

    const currentCanvasElement = canvasRef.current; // Capture for use in this effect scope

    const actualVideoWidth = videoElement.clientWidth;
    const actualVideoHeight = videoElement.clientHeight;

    if (actualVideoWidth === 0 || actualVideoHeight === 0) {
      console.log('FaceRecognition: Video client dimensions are zero, skipping setup for now.');
      return;
    }
    
    if (renderDimensions.width !== actualVideoWidth || renderDimensions.height !== actualVideoHeight) {
      setRenderDimensions({ width: actualVideoWidth, height: actualVideoHeight });
      return; 
    }
    
    const displaySize = { width: actualVideoWidth, height: actualVideoHeight };
    currentDisplaySizeRef.current = displaySize; // Update ref

    if (currentCanvasElement) {
        canvasContextRef.current = currentCanvasElement.getContext('2d');
        if (canvasContextRef.current) { // only match if context is successfully obtained
            faceapi.matchDimensions(currentCanvasElement, displaySize);
            console.log(`FaceRecognition: Canvas matched dimensions (using clientWidth/Height): ${displaySize.width}x${displaySize.height}`);
        } else {
            console.error("FaceRecognition: Failed to get canvas 2D context.");
            return; // Cannot proceed without context
        }
    } else {
        canvasContextRef.current = null; // Canvas not available
        return; // Cannot proceed without canvas
    }

    let detectionIntervalId: number | null = null;
    let activeDetectionTimeoutId: number | null = null;
    let nextRandomDetectionCycleTimeoutId: number | null = null;

    const performDetection = async () => {
      if (!isDetectingActiveRef.current || 
          !videoElement || videoElement.paused || videoElement.ended || 
          !currentCanvasElement || !canvasContextRef.current ) {
        return;
      }
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        return;
      }
      
      const detections = await faceapi.detectAllFaces(videoElement, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptors();
      
      if (!isDetectingActiveRef.current) { // Check again after await
        // If detection stopped while awaiting, ensure canvas is clear (stopActiveDetection handles primary clear)
        // and do not draw.
        if (canvasContextRef.current) {
             canvasContextRef.current.clearRect(0, 0, currentDisplaySizeRef.current.width, currentDisplaySizeRef.current.height);
        }
        return;
      }
      
      const context = canvasContextRef.current;
      if (!context) return; // Should be caught by initial check, but good practice

      context.clearRect(0, 0, currentDisplaySizeRef.current.width, currentDisplaySizeRef.current.height);
      const resizedDetections = faceapi.resizeResults(detections, currentDisplaySizeRef.current);

      if (resizedDetections.length > 0) {
        const boxDrawOptions: faceapi.draw.IDrawBoxOptions = {
          boxColor: 'rgba(0, 255, 0, 0.5)',
          lineWidth: 1,
          drawLabelOptions: { 
            fontSize: 10,
            padding: 2,
          }
        };

        // const landmarkDrawOptions: faceapi.draw.IDrawFaceLandmarksOptions = {
        //   lineWidth: 1,
        //   pointSize: 2,
        //   drawLines: true,
        //   lineColor: 'yellow',
        //   pointColor: 'yellow'
        // };

        resizedDetections.forEach((detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>) => {
          const { box, score } = detection.detection;
          let label = score.toFixed(2); 

          if (faceMatcher && detection.descriptor) {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            label = `${bestMatch.label} (${bestMatch.distance.toFixed(2)})`;
          }

          new faceapi.draw.DrawBox(box, { ...boxDrawOptions, label }).draw(currentCanvasElement);
          // new faceapi.draw.DrawFaceLandmarks(detection.landmarks, landmarkDrawOptions).draw(currentCanvasElement);
        });
      }
    };

    // Renamed from stopActiveDetection to avoid conflict with the outer scope one if any confusion.
    const stopCurrentDetectionCycle = () => {
      isDetectingActiveRef.current = false; // Set flag first
      if (detectionIntervalId) {
        clearInterval(detectionIntervalId);
        detectionIntervalId = null;
        console.log('FaceRecognition: Stopped active detection interval.');
      }
      // Always clear canvas when stopping active detection period
      if (canvasContextRef.current && currentDisplaySizeRef.current.width > 0) {
        console.log('FaceRecognition: Clearing canvas on stopCurrentDetectionCycle.');
        canvasContextRef.current.clearRect(0, 0, currentDisplaySizeRef.current.width, currentDisplaySizeRef.current.height);
      }
    };
    
    const startCurrentActiveDetectionPeriod = (duration: number) => {
      console.log(`FaceRecognition: Starting active detection period for ${duration / 1000}s.`);
      
      if (detectionIntervalId) clearInterval(detectionIntervalId); // Clear previous interval
      if (activeDetectionTimeoutId) clearTimeout(activeDetectionTimeoutId); // Clear previous timeout for active period

      isDetectingActiveRef.current = true;
      detectionIntervalId = window.setInterval(performDetection, 100); 

      activeDetectionTimeoutId = window.setTimeout(() => {
        console.log('FaceRecognition: Active detection period ended.');
        stopCurrentDetectionCycle();
        scheduleNextDetectionCycle(); 
      }, duration);
    };

    const scheduleNextDetectionCycle = () => {
      const minDelay = 2 * 60 * 1000; 
      const maxDelay = 3 * 60 * 1000; 
      const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
      
      console.log(`FaceRecognition: Scheduling next detection cycle in ${(randomDelay / (60 * 1000)).toFixed(2)} minutes.`);
      if (nextRandomDetectionCycleTimeoutId) clearTimeout(nextRandomDetectionCycleTimeoutId);
      nextRandomDetectionCycleTimeoutId = window.setTimeout(() => {
        startCurrentActiveDetectionPeriod(15000); 
      }, randomDelay);
    };

    console.log('FaceRecognition: Starting initial detection period.');
    startCurrentActiveDetectionPeriod(15000); 

    return () => {
      console.log("FaceRecognition: Cleaning up detection timers and canvas.");
      stopCurrentDetectionCycle(); // This will set isDetectingActiveRef to false and clear canvas
      if (activeDetectionTimeoutId) clearTimeout(activeDetectionTimeoutId);
      if (nextRandomDetectionCycleTimeoutId) clearTimeout(nextRandomDetectionCycleTimeoutId);
    };
  }, [videoElement, modelsLoaded, faceMatcher, renderDimensions.width, renderDimensions.height]); 

  if (!modelsLoaded) {
    return <div>Loading face recognition models...</div>;
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: `${renderDimensions.width}px`, 
      height: `${renderDimensions.height}px`,
      zIndex: 10, 
    }}>
      <canvas
        ref={canvasRef}
        width={renderDimensions.width} 
        height={renderDimensions.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%', 
          height: '100%',
        }}
      />
    </div>
  );
};

export default FaceRecognition;
