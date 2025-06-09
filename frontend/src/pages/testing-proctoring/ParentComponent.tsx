import React, { useState, useEffect, useRef } from "react";
import * as faceapi from '@vladmandic/face-api';
// Assuming FacePoseDetector, VoiceActivityDetection, HandsDetection are in the same directory or correctly pathed
// import FacePoseDetector from "./FacePoseDetector"; 
// import VoiceActivityDetection from "./VoiceActivityDetection";
// import { FilesetResolver } from "@mediapipe/tasks-vision"; // Fully commented out
// import HandsDetection from "./HandsDetection";
import FaceRecognition from "./FaceRecognition"; 


const ParentComponent = () => {
    // const [visionFilesetResolver, setVisionFilesetResolver] = useState<FilesetResolver | null>(null); 
    // const [audioFilesetResolver, setAudioFilesetResolver] = useState<FilesetResolver | null>(null); 
    const [faceApiModelsLoaded, setFaceApiModelsLoaded] = useState(false);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null); 
    const [labeledFaceDescriptors, setLabeledFaceDescriptors] = useState<faceapi.LabeledFaceDescriptors[] | null>(null);
    const modelsPath = '/models/face-api/model'; // Corrected path

    // Temporarily create a video element here for FaceRecognition, as FacePoseDetector is commented out
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = localVideoRef.current; // Capture ref for use in listeners and cleanup
        if (!video) {
            console.log("ParentComponent: localVideoRef is null, cannot setup webcam. This might happen if models/descriptors are not yet loaded.");
            return;
        }

        const setupWebcam = async () => {
            try {
                console.log("ParentComponent: Requesting webcam access...");
                const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
                video.srcObject = stream;
                console.log("ParentComponent: Webcam stream acquired.");

                video.onloadedmetadata = () => {
                    console.log("ParentComponent: Video metadata loaded. Attempting to play...");
                    video.play().then(() => {
                        console.log("ParentComponent: Video playback started successfully.");
                        setVideoElement(video); // Set videoElement state AFTER metadata is loaded and play is initiated
                        console.log("ParentComponent: Webcam stream attached, metadata loaded, playback started, and video element state set.");
                    }).catch(err => {
                        console.error("ParentComponent: Error attempting to play video:", err);
                        // Optionally, you could still setVideoElement(video) here if FaceRecognition can handle a non-playing video
                        // or if you want to show an error to the user.
                    });
                };

                video.onerror = (e) => {
                    console.error("ParentComponent: Video element error:", e);
                };

            } catch (err) {
                console.error("ParentComponent: Error accessing webcam (getUserMedia):", err);
                // Handle webcam access error (e.g., show a message to the user)
            }
        };

        // Only setup webcam if models and descriptors are loaded, ensuring video element is rendered
        if (faceApiModelsLoaded && labeledFaceDescriptors !== null) {
            setupWebcam();
        }
        
        // Cleanup function to stop the webcam stream when the component unmounts
        return () => {
            if (video && video.srcObject) {
                const stream = video.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
                console.log("ParentComponent: Webcam stream stopped on component unmount.");
            }
        };
    }, [faceApiModelsLoaded, labeledFaceDescriptors]); // Runs when models/descriptors are loaded, ensuring video element is in DOM    // Helper function to validate image URLs
    const isValidImageUrl = (url: string): boolean => {
      try {
        // Filter out .keep files
        if (url.includes('/.keep')) return false;
        
        // Parse the URL to get just the path without query parameters
        const urlObj = new URL(url);
        const path = urlObj.pathname.toLowerCase();
        
        // Only allow common image formats
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        return imageExtensions.some(ext => path.endsWith(ext));
      } catch (error) {
        console.error('Invalid URL:', url, error);
        return false;
      }
    };

    async function loadLabeledImagesFromAPI(): Promise<faceapi.LabeledFaceDescriptors[]> {
      try {
        const response = await fetch('http://localhost:4001/api/activity/known-faces');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Fetched known faces data from API:", data);

        // Access the faces array from the response
        const peopleData = data.faces || [];
        
        if (!Array.isArray(peopleData)) {
          console.error("API response for known faces is not an array:", peopleData);
          return [];
        }

        const labeledDescriptors = await Promise.all(
          peopleData.map(async (person) => {
            const descriptions: Float32Array[] = [];

            // Filter valid image URLs first
            const validImageUrls = person.imagePaths.filter(isValidImageUrl);

            if (validImageUrls.length === 0) {
              console.warn(`No valid image URLs found for person: ${person.label}`);
              return null;
            }

            for (const imgUrl of validImageUrls) {
              try {
                console.log(`Processing image: ${imgUrl}`);
                
                // First try to fetch the image directly to validate the URL
                try {
                  console.log(`Fetching image from URL: ${imgUrl}`);
                  const response = await fetch(imgUrl);
                  if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                  }
                  console.log(`Successfully fetched image, content-type:`, response.headers.get('content-type'));
                  
                  const blob = await response.blob();
                  console.log(`Successfully converted response to blob, size: ${blob.size} bytes`);
                  
                  const imageUrl = URL.createObjectURL(blob);
                  console.log(`Created object URL: ${imageUrl}`);
                  
                  const img = await faceapi.fetchImage(imageUrl);
                  console.log(`Successfully loaded image into face-api`);
                  
                  const detection = await faceapi
                    .detectSingleFace(img)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                  // Clean up the object URL
                  URL.revokeObjectURL(imageUrl);

                  if (detection) {
                    descriptions.push(detection.descriptor);
                    console.log(`Successfully processed face from: ${imgUrl}`);
                  } else {
                    console.warn(`No face detected in image: ${imgUrl}`);
                  }
                } catch (fetchError) {
                  console.error(`Error fetching/processing image ${imgUrl}:`, fetchError);
                  throw fetchError;
                }
              } catch (imgError) {
                console.error(`Error processing image ${imgUrl}:`, imgError);
                // Continue with next image
              }
            }

            // Only create descriptor if we have at least one valid face
            return descriptions.length > 0 
              ? new faceapi.LabeledFaceDescriptors(person.label, descriptions)
              : null;
          })
        );

        // Filter out null values and descriptors with no valid faces
        return labeledDescriptors.filter((desc): desc is faceapi.LabeledFaceDescriptors => 
          desc !== null && desc.descriptors.length > 0
        );
      } catch (error) {
        // Handle specific error types
        if (error instanceof TypeError && error.message.includes('CORS')) {
          console.error("CORS error while loading known faces - please check server CORS configuration:", error);
        } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          console.error("Network error while loading known faces - Is the backend server running?", error);
        } else {
          console.error("Error loading labeled images from API:", error);
        }
        return [];
      }
    }

    useEffect(() => {
        /* // MediaPipe Initializers - Fully Commented out
        const initializeMediaPipeResolvers = async () => {
            try {
                // const visionResolver = await FilesetResolver.forVisionTasks(
                //     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
                // );
                // setVisionFilesetResolver(visionResolver);
                // console.log("MediaPipe Vision FilesetResolver initialized.");

                // const audioResolver = await FilesetResolver.forAudioTasks(
                //     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.10/wasm"
                // );
                // setAudioFilesetResolver(audioResolver);
                // console.log("MediaPipe Audio FilesetResolver initialized.");
            } catch (error) {
                console.error("Error initializing MediaPipe FilesetResolvers:", error);
            }
        };
        */

        const loadFaceApiModels = async () => {
            try {
                console.log("Loading face-api.js models from:", modelsPath);
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(modelsPath),
                    faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath),
                    faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath),
                    faceapi.nets.faceExpressionNet.loadFromUri(modelsPath), 
                    faceapi.nets.ageGenderNet.loadFromUri(modelsPath)      
                ]);
                setFaceApiModelsLoaded(true);
                console.log("face-api.js models loaded successfully.");
            } catch (error) {
                console.error("Error loading face-api.js models:", error);
                console.warn(`Ensure models are in 'public${modelsPath}'. If using Vite, this means 'frontend/public/models/face-api.js/model/'. This path assumes you copied the entire 'face-api.js' folder from node_modules into 'public/models/'.`); // Updated warning path
            }
        };

        const initializeKnownFaces = async () => {
            // This check is important: only proceed if models are loaded.
            if (faceApiModelsLoaded) { 
                try {
                    console.log("Loading labeled images for face recognition from API...");
                    const descriptors = await loadLabeledImagesFromAPI();
                    const validDescriptors = descriptors.filter(d => d.descriptors.length > 0);
                    setLabeledFaceDescriptors(validDescriptors); // Can be an empty array
                    console.log("Labeled face descriptors from API processed and set:", validDescriptors);
                    if (validDescriptors.length === 0) {
                        console.warn("No valid labeled descriptors were loaded. Face recognition may not work as expected.");
                    }
                } catch (error) {
                    console.error("Error loading labeled face descriptors from API:", error);
                }
            }
        };

        // initializeMediaPipeResolvers(); // Call commented out
        
        if (!faceApiModelsLoaded) {
            loadFaceApiModels();
        }

        // This effect should run when faceApiModelsLoaded changes to true,
        // or if labeledFaceDescriptors is still null (initial load attempt).
        if (faceApiModelsLoaded && labeledFaceDescriptors === null) {
            initializeKnownFaces();
        }

    }, [faceApiModelsLoaded, labeledFaceDescriptors]); // Rerun if models load or if descriptor loading needs a retry (though typically it's one shot after models load)

    // const handleVideoElementReady = (element: HTMLVideoElement) => { // Commented out as FacePoseDetector is not used
    //     setVideoElement(element);
    // };

    // Updated loading condition: show loading until models are loaded AND descriptor fetching has completed (even if it results in an empty array).
    if (!faceApiModelsLoaded || labeledFaceDescriptors === null) { 
        let loadingMessage = "Loading resources... (";
        // if (!visionFilesetResolver) loadingMessage += "MediaPipe Vision, "; // Commented out
        // if (!audioFilesetResolver) loadingMessage += "MediaPipe Audio, "; // Commented out
        if (!faceApiModelsLoaded) loadingMessage += "face-api.js models, ";
        if (labeledFaceDescriptors === null) loadingMessage += "known faces via API, "; 
        loadingMessage = loadingMessage.endsWith(", ") ? loadingMessage.slice(0, -2) : loadingMessage;
        loadingMessage += ")";
        
        return <div>{loadingMessage}</div>;
    }
    
    // Special message if models loaded but no faces were recognized/processed from API
    if (faceApiModelsLoaded && labeledFaceDescriptors !== null && labeledFaceDescriptors.length === 0) {
        console.warn("Models loaded, but no known face descriptors available. Face recognition will not be able to identify individuals.");
        // Optionally, display a message to the user in this case, or proceed allowing detection without recognition.
    }


    return (
        <div style={{ position: 'relative' }}> 
            {/* Video element for FaceRecognition - normally provided by FacePoseDetector, now local */}
            <video 
                ref={localVideoRef} 
                style={{ display: 'block', width: '640px', height: '480px', border: '1px solid black' }} 
                autoPlay 
                muted 
                playsInline // Important for iOS
            ></video>
            
            {/* <FacePoseDetector 
                filesetResolver={visionFilesetResolver} 
                onVideoElementReady={handleVideoElementReady} 
            /> */}
            {/* <HandsDetection filesetResolver={visionFilesetResolver} /> */}
            {/* <VoiceActivityDetection filesetResolver={audioFilesetResolver} /> */}
            
            {/* Render FaceRecognition once everything is ready */}
            {videoElement && faceApiModelsLoaded && labeledFaceDescriptors !== null && (
                <FaceRecognition 
                    videoElement={videoElement} 
                    modelsLoaded={faceApiModelsLoaded} // Pass this to indicate models are ready
                    labeledDescriptors={labeledFaceDescriptors} // Pass the loaded descriptors
                />
            )}
        </div>
    );
};

export default ParentComponent;
