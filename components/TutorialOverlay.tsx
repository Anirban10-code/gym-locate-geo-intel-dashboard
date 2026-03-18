import React, { useState } from 'react';

// Slide Content
const SLIDES = [
    {
        emoji: '📍',
        title: 'Discover Locations',
        text: 'Use the top search bar to find any area or click directly on the map to drop a pin. We automatically identify neighborhoods, tech parks, and key intersections.'
    },
    {
        emoji: '🔄',
        title: 'Switch Domains',
        text: 'Select your business type (Gyms, Restaurants, Banks, etc.) from the left panel. The map and data instantly adapt to show relevant competitors and demographic synergy.'
    },
    {
        emoji: '📊',
        title: 'Instant Viability Scores',
        text: 'Review the Geo-Grounded Strategy panel for a real-time site score (0-100) combining Demand, Access, Competition Cap, and Vibe.'
    },
    {
        emoji: '🤖',
        title: 'Ask the AI Assistant',
        text: 'Need deeper insights? Open the purple chat icon on the bottom right to ask complex questions like "Compare MG Road to Indiranagar" or "Where is the nearest premium gym?".'
    }
];

export const TutorialOverlay: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    const handleNext = () => {
        if (currentSlide < SLIDES.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            setIsOpen(false);
            setCurrentSlide(0);
        }
    };

    const handlePrev = () => {
        if (currentSlide > 0) {
            setCurrentSlide(currentSlide - 1);
        }
    };

    const handleSkip = () => {
        setIsOpen(false);
        setCurrentSlide(0);
    };

    return (
        <>
            {/* The Trigger Button (replacing the old 'Suggest Ideas' button) */}
            <button
                onClick={() => setIsOpen(true)}
                className="p-2 rounded-xl transition-all border bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:shadow-md group relative flex items-center justify-center"
                title="How to use Geo-Intel"
            >
                <span className="text-sm">💡</span>
                <span className="absolute -bottom-8 right-0 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded whitespace-nowrap transition-opacity pointer-events-none z-50">
                    How it works
                </span>
            </button>

            {/* The Modal Overlay */}
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-sm w-full border border-slate-100 transform transition-all animate-in zoom-in-95 duration-300">
                        {/* Header/Progress */}
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Quick Tour • {currentSlide + 1} / {SLIDES.length}
                            </span>
                            <button
                                onClick={handleSkip}
                                className="text-[10px] text-slate-400 hover:text-slate-700 font-bold transition-colors uppercase tracking-widest"
                            >
                                Skip
                            </button>
                        </div>

                        {/* Slide Content */}
                        <div className="p-8 text-center min-h-[220px] flex flex-col justify-center">
                            <div className="text-5xl mb-4 animate-bounce">
                                {SLIDES[currentSlide].emoji}
                            </div>
                            <h3 className="text-lg font-black text-slate-800 mb-2">
                                {SLIDES[currentSlide].title}
                            </h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                {SLIDES[currentSlide].text}
                            </p>
                        </div>

                        {/* Footer/Navigation */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                            <button
                                onClick={handlePrev}
                                disabled={currentSlide === 0}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                    currentSlide === 0
                                        ? 'text-slate-300 cursor-not-allowed'
                                        : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                Back
                            </button>
                            
                            {/* Dots Indicators */}
                            <div className="flex gap-1.5">
                                {SLIDES.map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                            idx === currentSlide
                                                ? 'bg-indigo-600 w-4'
                                                : 'bg-slate-300'
                                        }`}
                                    />
                                ))}
                            </div>

                            <button
                                onClick={handleNext}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all"
                            >
                                {currentSlide === SLIDES.length - 1 ? 'Get Started' : 'Next'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
