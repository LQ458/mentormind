import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig, Audio, staticFile } from 'remotion';

// Define types locally for now to avoid compilation dependency on backend types
interface Scene {
    id: string;
    duration: number;
    narration: string;
    action: string;
    param: string;
    visual_type?: string;
    audio_path?: string;
}

interface VideoScript {
    title: string;
    scenes: Scene[];
    total_duration: number;
}

export const LessonVideo: React.FC<{ script: VideoScript }> = ({ script }) => {
    const { fps } = useVideoConfig();

    let currentFrame = 0;

    return (
        <AbsoluteFill className="bg-white">
            {script.scenes.map((scene, index) => {
                const durationInFrames = Math.floor(scene.duration * fps);
                const from = currentFrame;
                currentFrame += durationInFrames;

                return (
                    <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
                        <SceneRenderer scene={scene} index={index} />
                        {scene.audio_path && (
                            <Audio src={scene.audio_path} />
                        )}
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};

// Helper for gradients
const gradients = [
    "from-blue-50 to-indigo-50",
    "from-emerald-50 to-teal-50",
    "from-orange-50 to-amber-50",
    "from-purple-50 to-pink-50"
];

const SceneRenderer: React.FC<{ scene: Scene; index: number }> = ({ scene, index }) => {
    const bgGradient = gradients[index % gradients.length];

    return (
        <AbsoluteFill className={`flex items-center justify-center p-10 bg-gradient-to-br ${bgGradient}`}>
            {scene.action === 'show_title' && (
                <div className="flex flex-col items-center gap-6">
                    <div className="text-9xl mb-4">🎓</div>
                    <h1 className="text-7xl font-bold text-gray-800 text-center leading-tight drop-shadow-sm animate-in fade-in zoom-in duration-700">
                        {scene.param}
                    </h1>
                </div>
            )}

            {scene.action === 'show_text' && (
                <div className="max-w-5xl bg-white/80 p-12 rounded-3xl shadow-xl backdrop-blur-sm border border-white/50">
                    <div className="text-5xl font-medium text-gray-800 text-center leading-relaxed break-words">
                        {scene.param}
                    </div>
                </div>
            )}

            {scene.action === 'show_image' && (
                <div className="flex flex-col items-center gap-8 w-full max-w-6xl">
                    <div className="relative group hover:scale-[1.02] transition-transform duration-500">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                        <img
                            src={`https://placehold.co/1280x720/e2e8f0/475569.png?text=${encodeURIComponent(scene.param)}`}
                            alt={scene.param}
                            className="relative rounded-2xl shadow-2xl w-full object-cover aspect-video"
                        />
                    </div>
                    {scene.narration && (
                        <div className="bg-white/90 px-8 py-4 rounded-full shadow-lg border border-gray-100">
                            <p className="text-3xl text-gray-700 font-medium italic">
                                "{scene.narration}"
                            </p>
                        </div>
                    )}
                </div>
            )}

            {scene.action === 'manim' && (
                <div className="text-center p-12 bg-black/5 rounded-3xl">
                    <div className="text-5xl text-blue-600 mb-6 font-semibold">[Mathematics Segment]</div>
                    <div className="text-3xl text-gray-600 font-mono bg-white p-8 rounded-xl shadow-inner border border-gray-200">
                        Content: {scene.param}
                    </div>
                </div>
            )}
        </AbsoluteFill>
    );
};
