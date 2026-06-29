import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Image as ImageIcon, Plus, FileText, ChevronRight, Download, Trash2, ArrowLeft, Share2, CheckSquare, Square, X, ArrowDownUp } from 'lucide-react';
import { getDocuments, saveDocument, deleteDocument } from './lib/store';
import { Document, DocumentPage, Point, FilterType } from './types';
import CropView from './components/CropView';
import FilterView from './components/FilterView';
import { warpPerspective, downscaleImage } from './lib/image';
import { generatePDF } from './lib/pdf';

type AppState = 'home' | 'view_doc' | 'crop' | 'filter';
type SortOrder = 'newest' | 'oldest' | 'alpha';

export default function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  
  // New scan state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [currentCorners, setCurrentCorners] = useState<Point[] | undefined>();
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  
  // Selection state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputGalleryRef = useRef<HTMLInputElement>(null);
  const fileInputCameraRef = useRef<HTMLInputElement>(null);
  const fileInputGalleryRef2 = useRef<HTMLInputElement>(null);
  const fileInputCameraRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDocuments(getDocuments());
  }, []);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    // We set loading state here if we want, but since it's local it might be fast enough
    const urls: string[] = [];
    
    for (const file of files) {
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
          if (typeof event.target?.result === 'string') {
            try {
              const downscaled = await downscaleImage(event.target.result, 1600);
              resolve(downscaled);
            } catch (err) {
              resolve(event.target.result);
            }
          } else {
             resolve('');
          }
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (url) {
         urls.push(url);
      }
    }
    
    if (urls.length > 0) {
      setCapturedImage(urls[0]);
      setProcessingQueue(urls.slice(1));
      setAppState('crop');
    }
    // reset input
    e.target.value = '';
  };

  const handleCropNext = async (corners: Point[]) => {
    try {
      if (!capturedImage) return;
      setCurrentCorners(corners);
      const warped = await warpPerspective(capturedImage, corners);
      setCroppedImage(warped);
      setAppState('filter');
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Error in crop: " + (err.message || err));
    }
  };

  const handleFilterSave = (filtered: string, filter: FilterType) => {
    if (!capturedImage || !croppedImage || !currentCorners) return;
    
    const newPage: DocumentPage = {
      id: Date.now().toString(),
      originalImage: capturedImage,
      croppedImage: croppedImage,
      filteredImage: filtered,
      filter: filter,
      corners: currentCorners
    };
    
    let docToUpdate = currentDoc;
    if (!docToUpdate) {
      docToUpdate = {
        id: Date.now().toString(),
        title: `Scan ${new Date().toLocaleDateString()}`,
        createdAt: Date.now(),
        pages: []
      };
    }
    
    docToUpdate = {
      ...docToUpdate,
      pages: [...docToUpdate.pages, newPage]
    };
    
    saveDocument(docToUpdate);
    setDocuments(getDocuments());
    setCurrentDoc(docToUpdate);
    
    if (processingQueue.length > 0) {
       setCapturedImage(processingQueue[0]);
       setProcessingQueue(processingQueue.slice(1));
       setCroppedImage(null);
       setCurrentCorners(undefined);
       setAppState('crop');
    } else {
       setCapturedImage(null);
       setCroppedImage(null);
       setCurrentCorners(undefined);
       setAppState('view_doc');
    }
  };

  const handleSaveAsPDF = async (doc: Document) => {
    try {
      const blob = await generatePDF(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to generate PDF", e);
    }
  };

  const handleSharePDF = async (doc: Document) => {
    try {
      const blob = await generatePDF(doc);
      const file = new File([blob], `${doc.title}.pdf`, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: doc.title,
        });
      } else {
        console.log("Sharing not supported on this browser.");
      }
    } catch (e) {
      console.error("Failed to share PDF", e);
    }
  };

  const handleDeleteDoc = (id: string) => {
    deleteDocument(id);
    setDocuments(getDocuments());
    setAppState('home');
    setCurrentDoc(null);
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDocs(next);
  };

  const handleDeleteSelected = () => {
    selectedDocs.forEach(id => deleteDocument(id));
    setDocuments(getDocuments());
    setSelectedDocs(new Set());
    setIsMultiSelect(false);
  };

  const handleShareSelected = async () => {
    try {
       const docsToShare = documents.filter(d => selectedDocs.has(d.id));
       const files = await Promise.all(docsToShare.map(async doc => {
         const blob = await generatePDF(doc);
         return new File([blob], `${doc.title}.pdf`, { type: 'application/pdf' });
       }));
       
       if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
          await navigator.share({
             files,
             title: "Shared Documents",
          });
       } else {
          console.log("Sharing multiple files is not supported on this browser.");
       }
    } catch (e) {
       console.error(e);
    }
  };

  if (appState === 'crop' && capturedImage) {
    return (
      <CropView
        imageSrc={capturedImage}
        onCrop={handleCropNext}
        onCancel={() => {
          setCapturedImage(null);
          setProcessingQueue([]);
          setAppState(currentDoc ? 'view_doc' : 'home');
        }}
      />
    );
  }

  if (appState === 'filter' && croppedImage) {
    return (
      <FilterView
        imageSrc={croppedImage}
        onSave={handleFilterSave}
        onBack={() => setAppState('crop')}
      />
    );
  }

  if (appState === 'view_doc' && currentDoc) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans">
         <div className="flex items-center justify-between p-4 bg-white border-b sticky top-0 z-10 shadow-sm">
            <button onClick={() => { setCurrentDoc(null); setAppState('home'); }} className="p-2 -ml-2 text-gray-600 hover:text-gray-900">
               <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold truncate flex-1 px-4">{currentDoc.title}</h1>
            <div className="flex items-center space-x-2">
              <button onClick={() => handleSharePDF(currentDoc)} className="p-2 text-green-600 hover:bg-green-50 rounded-full" title="Share PDF">
                 <Share2 className="w-5 h-5" />
              </button>
              <button onClick={() => handleSaveAsPDF(currentDoc)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="Save as PDF">
                 <Download className="w-5 h-5" />
              </button>
              <button onClick={() => handleDeleteDoc(currentDoc.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-full" title="Delete">
                 <Trash2 className="w-5 h-5" />
              </button>
            </div>
         </div>
         
         {errorMessage && (
           <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between text-sm text-red-800">
             <span>{errorMessage}</span>
             <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Dismiss</button>
           </div>
         )}
         
         <div className="flex-1 overflow-y-auto p-4 space-y-6">
           {currentDoc.pages.map((page, idx) => (
             <div key={page.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-2 bg-gray-50 border-b text-sm font-medium text-gray-500 flex justify-between">
                  <span>Page {idx + 1}</span>
                </div>
                <div className="p-4 flex justify-center bg-gray-100">
                  <img src={page.filteredImage} alt={`Page ${idx+1}`} className="max-h-[60vh] object-contain shadow-md" />
                </div>
             </div>
           ))}
         </div>
         
         <div className="p-4 bg-white border-t flex justify-center space-x-4">
            <button 
              onClick={() => fileInputGalleryRef2.current?.click()}
              className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-6 py-3 rounded-full font-medium hover:bg-gray-200 transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => fileInputCameraRef2.current?.click()}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-full font-medium hover:bg-blue-700 shadow-md transition-colors flex-1 justify-center max-w-xs"
            >
              <Camera className="w-5 h-5" />
              <span>Scan Page</span>
            </button>
         </div>
         <input 
            type="file" 
            accept="image/*"
            multiple
            className="hidden" 
            ref={fileInputGalleryRef2}
            onChange={handleCapture}
         />
         <input 
            type="file" 
            accept="image/*"
            capture="environment" 
            className="hidden" 
            ref={fileInputCameraRef2}
            onChange={handleCapture}
         />
      </div>
    );
  }

  // Home View
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans relative">
      <div className="p-5 bg-white shadow-sm border-b sticky top-0 z-10 flex items-center justify-between">
        {isMultiSelect ? (
          <>
            <div className="flex items-center space-x-3">
              <button onClick={() => { setIsMultiSelect(false); setSelectedDocs(new Set()); }} className="p-1 -ml-1 text-gray-600">
                <X className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-semibold text-gray-800">{selectedDocs.size} Selected</h1>
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={handleShareSelected} 
                disabled={selectedDocs.size === 0}
                className="p-2 text-green-600 hover:bg-green-50 rounded-full disabled:opacity-50"
              >
                 <Share2 className="w-5 h-5" />
              </button>
              <button 
                onClick={handleDeleteSelected} 
                disabled={selectedDocs.size === 0}
                className="p-2 text-red-600 hover:bg-red-50 rounded-full disabled:opacity-50"
              >
                 <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-800">My Scans</h1>
            {documents.length > 0 && (
              <div className="flex items-center space-x-2">
                <div className="relative flex items-center group cursor-pointer text-gray-600 bg-gray-100 rounded-lg px-2 py-1 hover:bg-gray-200 transition-colors">
                  <ArrowDownUp className="w-4 h-4 mr-1" />
                  <select 
                    value={sortOrder} 
                    onChange={e => setSortOrder(e.target.value as SortOrder)}
                    className="bg-transparent text-sm font-medium appearance-none outline-none cursor-pointer pr-4"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="alpha">A-Z</option>
                  </select>
                </div>
                <button onClick={() => setIsMultiSelect(true)} className="text-blue-600 font-medium px-2 py-1">
                  Select
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between text-sm text-red-800">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 font-semibold text-xs">Dismiss</button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
             <FileText className="w-16 h-16 text-gray-300" />
             <p className="text-lg">No documents yet</p>
             <p className="text-sm">Tap the camera button to start scanning</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             {[...documents].sort((a, b) => {
                 if (sortOrder === 'newest') return b.createdAt - a.createdAt;
                 if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
                 if (sortOrder === 'alpha') return a.title.localeCompare(b.title);
                 return 0;
             }).map(doc => {
               const isSelected = selectedDocs.has(doc.id);
               return (
                 <div 
                   key={doc.id} 
                   onClick={() => {
                      if (isMultiSelect) {
                        const next = new Set(selectedDocs);
                        if (next.has(doc.id)) next.delete(doc.id);
                        else next.add(doc.id);
                        setSelectedDocs(next);
                      } else {
                        setCurrentDoc(doc); 
                        setAppState('view_doc');
                      }
                   }}
                   onContextMenu={(e) => {
                      e.preventDefault();
                      if (!isMultiSelect) {
                        setIsMultiSelect(true);
                        setSelectedDocs(new Set([doc.id]));
                      }
                   }}
                   className={`bg-white p-4 rounded-xl shadow-sm border flex items-center space-x-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
                 >
                    {isMultiSelect && (
                      <div className="flex-shrink-0" onClick={(e) => toggleSelection(doc.id, e)}>
                        {isSelected ? <CheckSquare className="w-6 h-6 text-blue-600" /> : <Square className="w-6 h-6 text-gray-400" />}
                      </div>
                    )}
                    <div className="w-16 h-20 bg-gray-100 rounded flex-shrink-0 overflow-hidden border border-gray-200">
                      {doc.pages[0] && (
                        <img src={doc.pages[0].filteredImage} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{doc.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-400 mt-1">{doc.pages.length} page{doc.pages.length !== 1 ? 's' : ''}</p>
                    </div>
                    {!isMultiSelect && <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                 </div>
               );
             })}
          </div>
        )}
      </div>

      <div className="absolute bottom-8 right-8 flex flex-col space-y-4">
         <button 
           onClick={() => fileInputGalleryRef.current?.click()}
           className="w-14 h-14 bg-white text-blue-600 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 border border-gray-100"
         >
           <ImageIcon className="w-6 h-6" />
         </button>
         <button 
           onClick={() => fileInputCameraRef.current?.click()}
           className="w-16 h-16 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-transform"
         >
           <Camera className="w-7 h-7" />
         </button>
         <input 
            type="file" 
            accept="image/*"
            multiple
            className="hidden" 
            ref={fileInputGalleryRef}
            onChange={handleCapture}
         />
         <input 
            type="file" 
            accept="image/*"
            capture="environment" 
            className="hidden" 
            ref={fileInputCameraRef}
            onChange={handleCapture}
         />
      </div>
    </div>
  );
}
