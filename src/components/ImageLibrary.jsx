import { useState, useEffect } from 'react';
import { Image, Upload, Grid3x3, Loader2, Star, User } from 'lucide-react';
import { storageService } from '../services/storage.service';

// Built-in curated puzzle images hosted in Supabase Storage
const BUILT_IN_IMAGES = [
    {
        id: 'builtin-1',
        name: 'Multivariate Shapes Grid',
        category: 'abstract',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/multivariate%20shapes%20grid.png',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/multivariate%20shapes%20grid.png'
    },
    {
        id: 'builtin-2',
        name: 'Interlock Triangles B&W',
        category: 'abstract',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/interlock%20triangles%20b&w.png',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/interlock%20triangles%20b&w.png'
    },
    {
        id: 'builtin-3',
        name: 'Fractal Flower',
        category: 'nature',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/fractal%20flower.jpeg',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/fractal%20flower.jpeg'
    },
    {
        id: 'builtin-4',
        name: 'Diamond Color Grid',
        category: 'abstract',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/diamond%20color-grid.png',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/diamond%20color-grid.png'
    },
    {
        id: 'builtin-5',
        name: 'Concentric Circles',
        category: 'abstract',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/concentric_circles_puzzle_d99d83b9.png',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/concentric_circles_puzzle_d99d83b9.png'
    },
    {
        id: 'builtin-6',
        name: 'Colorful Geometric Pattern',
        category: 'abstract',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/colorful_geometric_puzzle_pattern_f397da79.png',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/colorful_geometric_puzzle_pattern_f397da79.png'
    },
    {
        id: 'builtin-7',
        name: 'Blurry Grid',
        category: 'abstract',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/blurry%20grid.jpeg',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/blurry%20grid.jpeg'
    },
    {
        id: 'builtin-8',
        name: 'Afrodyre',
        category: 'nature',
        url: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/afrodyre.jpeg',
        thumbnail: 'https://laghoneylhlxytijjvpq.supabase.co/storage/v1/object/public/puzzle-images/library/afrodyre.jpeg'
    }
];

const CATEGORIES = [
    { id: 'all', label: 'All', icon: Grid3x3 },
    { id: 'nature', label: 'Nature', icon: Star },
    { id: 'abstract', label: 'Abstract', icon: Star }
];

const ImageLibrary = ({ userId, onSelectImage, disabled = false }) => {
    const [activeTab, setActiveTab] = useState('builtin'); // 'builtin' | 'uploads'
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [userImages, setUserImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    // Load user images when uploads tab is selected
    useEffect(() => {
        if (activeTab === 'uploads' && userId) {
            loadUserImages();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, userId]);

    const loadUserImages = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const images = await storageService.getUserImages(userId);
            setUserImages(images || []);
        } catch (err) {
            console.error('Failed to load user images:', err);
            setUserImages([]);
        } finally {
            setLoading(false);
        }
    };

    const filteredBuiltIn = selectedCategory === 'all'
        ? BUILT_IN_IMAGES
        : BUILT_IN_IMAGES.filter(img => img.category === selectedCategory);

    const handleSelect = (image) => {
        setSelectedImage(image);
    };

    // Compress image using canvas to stay under 5MB for Supabase uploads
    const compressImage = (blob, maxDim = 2048, quality = 0.8) => {
        return new Promise((resolve) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                let { width, height } = img;
                // Scale down if larger than maxDim
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((compressed) => resolve(compressed), 'image/jpeg', quality);
            };
            img.onerror = () => resolve(blob); // Fallback to original on error
            img.src = URL.createObjectURL(blob);
        });
    };

    const handleConfirm = async () => {
        if (!selectedImage) return;

        try {
            const imageUrl = selectedImage.isUserUpload
                ? (selectedImage.storage_url || selectedImage.url)
                : selectedImage.url;
            const name = selectedImage.file_name || selectedImage.name || 'library-image';

            const response = await fetch(imageUrl);
            let blob = await response.blob();

            // Compress if over 5MB
            if (blob.size > 5 * 1024 * 1024) {
                blob = await compressImage(blob);
            }

            const file = new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
            onSelectImage({
                file,
                url: imageUrl,
                name,
                isLibrary: true
            });
        } catch (err) {
            console.error('Failed to load library image:', err);
        }
    };

    return (
        <div className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
            {/* Tab Header */}
            <div className="flex border-b border-white/10">
                <button
                    onClick={() => setActiveTab('builtin')}
                    className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${activeTab === 'builtin'
                        ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5'
                        : 'text-purple-300 hover:text-white'
                        }`}
                >
                    <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Built-in Library
                </button>
                <button
                    onClick={() => setActiveTab('uploads')}
                    className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${activeTab === 'uploads'
                        ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5'
                        : 'text-purple-300 hover:text-white'
                        }`}
                >
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    My Uploads
                </button>
            </div>

            {/* Content */}
            <div className="p-3 sm:p-4">
                {/* Category filters for built-in tab */}
                {activeTab === 'builtin' && (
                    <div className="flex gap-1.5 sm:gap-2 mb-3 sm:mb-4 overflow-x-auto hide-scrollbar pb-1">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.id
                                    ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40'
                                    : 'bg-white/5 text-purple-300 hover:bg-white/10'
                                    }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Image Grid */}
                {activeTab === 'builtin' ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 max-h-[240px] sm:max-h-[300px] overflow-y-auto hide-scrollbar">
                        {filteredBuiltIn.map(image => (
                            <button
                                key={image.id}
                                onClick={() => handleSelect(image)}
                                disabled={disabled}
                                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group ${selectedImage?.id === image.id
                                    ? 'border-cyan-400 ring-2 ring-cyan-400/40 scale-[0.97]'
                                    : 'border-transparent hover:border-white/30'
                                    }`}
                            >
                                <img
                                    src={image.thumbnail}
                                    alt={image.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="absolute bottom-1 left-1 right-1 text-white text-[9px] sm:text-[10px] font-medium truncate">
                                        {image.name}
                                    </span>
                                </div>
                                {selectedImage?.id === image.id && (
                                    <div className="absolute top-1 right-1 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
                                        <span className="text-white text-xs">✓</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                ) : (
                    /* User Uploads Tab */
                    <div>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                            </div>
                        ) : userImages.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 max-h-[240px] sm:max-h-[300px] overflow-y-auto hide-scrollbar">
                                {userImages.map(image => (
                                    <button
                                        key={image.id}
                                        onClick={() => handleSelect({ ...image, isUserUpload: true })}
                                        disabled={disabled}
                                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group ${selectedImage?.id === image.id
                                            ? 'border-cyan-400 ring-2 ring-cyan-400/40 scale-[0.97]'
                                            : 'border-transparent hover:border-white/30'
                                            }`}
                                    >
                                        <img
                                            src={image.storage_url}
                                            alt={image.file_name}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="absolute bottom-1 left-1 right-1 text-white text-[9px] sm:text-[10px] font-medium truncate">
                                                {image.file_name}
                                            </span>
                                        </div>
                                        {selectedImage?.id === image.id && (
                                            <div className="absolute top-1 right-1 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
                                                <span className="text-white text-xs">✓</span>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 sm:py-12">
                                <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-purple-400 mx-auto mb-2 sm:mb-3" />
                                <p className="text-purple-300 text-xs sm:text-sm">No saved images yet</p>
                                <p className="text-purple-400 text-[10px] sm:text-xs mt-1">
                                    Upload an image above to save it to your library
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Confirm Button */}
                {selectedImage && (
                    <button
                        onClick={handleConfirm}
                        disabled={disabled}
                        className="w-full mt-3 sm:mt-4 py-2.5 sm:py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all active:scale-[0.98] text-sm sm:text-base touch-target"
                    >
                        Use &quot;{selectedImage.name || selectedImage.file_name}&quot;
                    </button>
                )}
            </div>
        </div>
    );
};

ImageLibrary.BUILT_IN_IMAGES = BUILT_IN_IMAGES;
export default ImageLibrary;
