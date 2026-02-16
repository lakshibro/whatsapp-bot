/**
 * Image Generation Service using Google Imagen API
 * Generates images from text prompts using Imagen models
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

class ImageService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
        
        // Imagen model variants
        this.models = [
            'imagen-4.0-generate-001',
            'imagen-4.0-fast-generate-001',
            'imagen-4.0-ultra-generate-001'
        ];
        
        console.log('🎨 Image Service initialized with Imagen models');
    }

    /**
     * Generate images from text prompt using Imagen API
     * @param {string} prompt - Text description of the image to generate
     * @param {object} options - Generation options
     * @returns {Promise<Array<string>>} Array of base64 encoded images
     */
    async generateImages(prompt, options = {}) {
        const {
            numberOfImages = 1,
            aspectRatio = '1:1',
            imageSize = '1K',
            personGeneration = 'allow_all'
        } = options;

        // Validate prompt length (max 480 tokens, roughly 3600 chars)
        if (prompt.length > 3600) {
            throw new Error('Prompt is too long. Maximum length is approximately 3600 characters.');
        }

        // Use REST API directly since @google/genai might not have generateImages method
        const model = this.models[0]; // Use standard model by default
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'x-goog-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    instances: [
                        {
                            prompt: prompt
                        }
                    ],
                    parameters: {
                        sampleCount: Math.min(Math.max(numberOfImages, 1), 4), // Between 1 and 4
                        aspectRatio: aspectRatio,
                        imageSize: imageSize,
                        personGeneration: personGeneration
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Imagen API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            
            // Extract images from response
            if (data.predictions && Array.isArray(data.predictions)) {
                const images = data.predictions
                    .map(pred => pred.bytesBase64Encoded)
                    .filter(Boolean);
                
                if (images.length === 0) {
                    throw new Error('No images generated in response');
                }
                
                return images;
            } else {
                throw new Error('Unexpected response format from Imagen API');
            }

        } catch (error) {
            console.error('❌ Error generating images:', error);
            
            // Try fallback model if quota/capacity error
            if (error.message?.includes('quota') || error.message?.includes('429') || error.message?.includes('503')) {
                console.log('🔄 Trying fallback Imagen model...');
                return this.generateImagesWithFallback(prompt, options);
            }
            
            throw error;
        }
    }

    /**
     * Try generating with fallback models
     */
    async generateImagesWithFallback(prompt, options) {
        for (let i = 1; i < this.models.length; i++) {
            try {
                const model = this.models[i];
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'x-goog-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        instances: [
                            {
                                prompt: prompt
                            }
                        ],
                        parameters: {
                            sampleCount: Math.min(Math.max(options.numberOfImages || 1, 1), 4),
                            aspectRatio: options.aspectRatio || '1:1',
                            imageSize: options.imageSize || '1K',
                            personGeneration: options.personGeneration || 'allow_all'
                        }
                    })
                });

                if (!response.ok) {
                    continue; // Try next model
                }

                const data = await response.json();
                
                if (data.predictions && Array.isArray(data.predictions)) {
                    const images = data.predictions
                        .map(pred => pred.bytesBase64Encoded)
                        .filter(Boolean);
                    
                    if (images.length > 0) {
                        return images;
                    }
                }
            } catch (err) {
                console.warn(`⚠️ Fallback model ${this.models[i]} failed:`, err.message);
                continue;
            }
        }
        
        throw new Error('All Imagen models failed to generate images');
    }
}

export default ImageService;
