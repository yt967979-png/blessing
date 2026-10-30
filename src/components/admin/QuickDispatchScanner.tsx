'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Camera,
  Flashlight,
  FlashlightOff,
  RefreshCw,
  Keyboard,
  CheckCircle2,
  AlertTriangle,
  Send,
  ExternalLink,
  Package,
  Truck,
  ArrowRight,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface ScannedOrder {
  id: string;
  orderNumber: string;
  studentName: string;
  phone: string;
  destination: string;
  itemsCount: number;
  itemsSummary: string;
  totalAmount: number;
  status: string;
  awbNumber?: string | null;
  isDispatched?: boolean;
}

interface DispatchResult {
  orderNumber: string;
  studentName: string;
  studentPhone: string;
  destination: string;
  awbNumber: string;
  stCourierUrl: string;
  siteTrackingUrl: string;
  whatsAppShareUrl: string;
  itemsSummary: string;
}

interface QuickDispatchScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderDispatched?: (orderNumber: string, awb: string) => void;
  onShowToast?: (msg: string) => void;
}

// Zero-dependency Web Audio Synthesizer for instant warehouse feedback
function playSynthBeep(type: 'order_locked' | 'awb_success' | 'error') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'order_locked') {
      // Crisp 880Hz ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'awb_success') {
      // Victory double chime (880Hz -> 1320Hz)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.09);
      gain2.gain.setValueAtTime(0.3, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.22);
    } else if (type === 'error') {
      // Low buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (_) {}
}

function triggerHaptic(type: 'order' | 'success' | 'error') {
  if (typeof window === 'undefined' || !navigator.vibrate) return;
  try {
    if (type === 'order') navigator.vibrate(80);
    else if (type === 'success') navigator.vibrate([60, 40, 100]);
    else if (type === 'error') navigator.vibrate([200, 100, 200]);
  } catch (_) {}
}

const VALID_DOCKET_REGEX = /^(STC[0-9]{9}|STCOE[0-9]{7,10}|[A-Z]{2,3}[0-9]{8,12}|[0-9]{10,13})$/;

function cleanScannedCode(raw: string): string {
  let s = String(raw || '').trim();
  if (s.includes('docket=')) {
    const m = s.match(/docket=([A-Z0-9]+)/i);
    if (m) s = m[1];
  } else if (s.includes('awb=')) {
    const m = s.match(/awb=([A-Z0-9]+)/i);
    if (m) s = m[1];
  }
  return s.replace(/\s+/g, '').toUpperCase();
}

function isOrderCode(raw: string): boolean {
  const c = cleanScannedCode(raw);
  return (
    c.startsWith('BPG') ||
    c.startsWith('ORD') ||
    c.includes('-') ||
    (c.length >= 8 && !/^[0-9]+$/.test(c) && !c.startsWith('STC') && !c.startsWith('TN'))
  );
}

export function QuickDispatchScanner({
  isOpen,
  onClose,
  onOrderDispatched,
  onShowToast,
}: QuickDispatchScannerProps) {
  // Step: 1 = Scan Order, 2 = Scan AWB, 3 = Completed Success
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Locked Order
  const [activeOrder, setActiveOrder] = useState<ScannedOrder | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [recentCount, setRecentCount] = useState(0);

  // Manual fallback inputs
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualOrderCode, setManualOrderCode] = useState('');
  const [manualAwbCode, setManualAwbCode] = useState('');

  // Camera elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const isScanningRef = useRef(false);
  const lastScannedTextRef = useRef('');
  const lastScanTimestampRef = useRef(0);

  // Sound helper
  const playSound = useCallback(
    (type: 'order_locked' | 'awb_success' | 'error') => {
      if (soundEnabled) {
        playSynthBeep(type);
      }
      triggerHaptic(type === 'order_locked' ? 'order' : type === 'awb_success' ? 'success' : 'error');
    },
    [soundEnabled]
  );

  // Start Camera with robust fallback & secure context check
  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    setErrorMessage(null);
    setPermissionDenied(false);

    if (typeof window !== 'undefined') {
      const isSec = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSec) {
        setPermissionDenied(true);
        setErrorMessage('Camera access requires HTTPS. Please open https://blessingpowerguide.in/admin or use manual entry.');
        setCameraLoading(false);
        return;
      }
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionDenied(true);
      setErrorMessage('Camera API is not supported on this browser or connection. Please use Chrome/Safari or manual entry.');
      setCameraLoading(false);
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream;
      try {
        // Try back environment camera first
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (firstErr: any) {
        console.warn('[Scanner] Environment camera fallback to default video:', firstErr);
        // Fallback to any available camera (front camera, webcam, etc.)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      // Check torch capability
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
      setHasTorch(Boolean(capabilities?.torch));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
      setPermissionDenied(false);
      setErrorMessage(null);
    } catch (err: any) {
      console.warn('[Scanner] Camera error:', err);
      setPermissionDenied(true);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera permission was blocked. Tap the 🔒 icon in your browser address bar to allow Camera, then tap "Enable Camera".');
      } else {
        setErrorMessage(err.message || 'Camera is unavailable or in use by another application.');
      }
    } finally {
      setCameraLoading(false);
    }
  }, []);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setTorchOn(false);
  }, []);

  // Toggle Torch
  const toggleTorch = useCallback(async () => {
    if (!trackRef.current || !hasTorch) return;
    try {
      const next = !torchOn;
      await (trackRef.current as any).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch (_) {}
  }, [hasTorch, torchOn]);

  // Handle Order Lookup (Step 1 -> Step 2)
  const handleOrderDetected = useCallback(
    async (rawCode: string) => {
      if (isLoading) return;
      const code = cleanScannedCode(rawCode);
      if (!code) return;

      // If user mistakenly scans an ST Courier AWB in Step 1
      if (
        VALID_DOCKET_REGEX.test(code) &&
        !code.startsWith('BPG') &&
        !code.startsWith('ORD') &&
        !code.includes('-')
      ) {
        playSound('error');
        setErrorMessage(
          `⚠️ "${code}" looks like an ST Courier AWB docket. Step 1 requires the Order label barcode on the shipping box!`
        );
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/admin/orders/lookup?code=${encodeURIComponent(code)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Order not found');
        }

        const order = data.order as ScannedOrder;
        setActiveOrder(order);
        playSound('order_locked');
        setStep(2);
      } catch (err: any) {
        playSound('error');
        setErrorMessage(err.message || 'Could not find order. Please verify barcode.');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, playSound]
  );

  // Handle AWB Assignment (Step 2 -> Step 3)
  const handleAwbDetected = useCallback(
    async (rawAwb: string, force = false) => {
      if (!activeOrder || isLoading) return;
      const awb = cleanScannedCode(rawAwb);
      if (!awb) return;

      // 1. Guard against scanning the Order label barcode again!
      if (
        awb === activeOrder.orderNumber.toUpperCase() ||
        awb === activeOrder.id.toUpperCase() ||
        isOrderCode(awb)
      ) {
        playSound('error');
        setErrorMessage(
          `⚠️ Scanned barcode "${awb}" is an Order ID, NOT an ST Courier AWB docket! Please scan the courier sticker.`
        );
        return;
      }

      // 2. Guard against non-ST Courier barcodes
      if (!VALID_DOCKET_REGEX.test(awb)) {
        playSound('error');
        setErrorMessage(
          `⚠️ "${awb}" is not a valid ST Courier AWB docket format. ST Courier AWBs are 10–13 digits (e.g. 63660535761) or start with STC.`
        );
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await fetch('/api/admin/orders/scan-dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: activeOrder.orderNumber,
            awbNumber: awb,
            force,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to dispatch order');
        }

        playSound('awb_success');
        setDispatchResult(data.order as DispatchResult);
        setRecentCount((c) => c + 1);
        setStep(3);

        if (onOrderDispatched) {
          onOrderDispatched(activeOrder.orderNumber, awb);
        }
        if (onShowToast) {
          onShowToast(`🎉 Order #${activeOrder.orderNumber} Dispatched!`);
        }
      } catch (err: any) {
        playSound('error');
        setErrorMessage(err.message || 'Failed to assign AWB.');
      } finally {
        setIsLoading(false);
      }
    },
    [activeOrder, isLoading, onOrderDispatched, onShowToast, playSound]
  );

  // Barcode Detection Loop
  useEffect(() => {
    if (!isOpen || step === 3) return;

    let animFrame: number;
    let detector: any = null;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        detector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'upc_a'],
        });
      } catch (_) {}
    }

    const scanFrame = async () => {
      if (!videoRef.current || !detector || videoRef.current.readyState < 2) {
        animFrame = requestAnimationFrame(scanFrame);
        return;
      }

      const now = Date.now();
      // Throttle detection every 120ms to prevent CPU saturation
      if (now - lastScanTimestampRef.current > 120 && !isScanningRef.current) {
        lastScanTimestampRef.current = now;
        try {
          isScanningRef.current = true;
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = String(barcodes[0].rawValue || '').trim();
            if (raw && raw !== lastScannedTextRef.current) {
              lastScannedTextRef.current = raw;

              if (step === 1) {
                await handleOrderDetected(raw);
              } else if (step === 2) {
                await handleAwbDetected(raw);
              }
            }
          }
        } catch (_) {
        } finally {
          isScanningRef.current = false;
        }
      }

      animFrame = requestAnimationFrame(scanFrame);
    };

    animFrame = requestAnimationFrame(scanFrame);

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [isOpen, step, handleOrderDetected, handleAwbDetected]);

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
      setStep(1);
      setActiveOrder(null);
      setDispatchResult(null);
      setErrorMessage(null);
      lastScannedTextRef.current = '';
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Reset for Next Order
  const handleResetForNext = () => {
    setStep(1);
    setActiveOrder(null);
    setDispatchResult(null);
    setErrorMessage(null);
    lastScannedTextRef.current = '';
    setShowManualModal(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col select-none overflow-hidden text-white font-sans">
      {/* Top Navigation Bar */}
      <div className="px-4 py-3 bg-slate-900/95 border-b border-white/10 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black text-amber-300 text-sm shadow-md">
            ⚡
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
              <span>QUICK DISPATCH SCANNER</span>
              {recentCount > 0 && (
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  ✓ {recentCount} Dispatched
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 font-medium">
              {step === 1 && 'Step 1/2: Scan Order Label Barcode'}
              {step === 2 && 'Step 2/2: Scan ST Courier AWB Docket'}
              {step === 3 && 'Order Successfully Dispatched!'}
            </p>
          </div>
        </div>

        {/* Right Tools */}
        <div className="flex items-center gap-1.5">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition-all ${
                torchOn
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/30'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title="Toggle Flashlight"
            >
              {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl transition-all ${
              soundEnabled ? 'bg-white/10 text-white' : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
            title="Toggle Sound"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Type Manually"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition-all ml-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover brightness-105"
        />

        {/* Dark Vignette Overlay with Center Cutout */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
          {/* Target Reticle Frame */}
          <div
            className={`relative w-72 h-48 sm:w-96 sm:h-56 rounded-2xl border-2 transition-all duration-300 flex items-center justify-center shadow-2xl ${
              step === 1
                ? 'border-cyan-400/80 shadow-cyan-500/20'
                : step === 2
                ? 'border-amber-400/90 shadow-amber-500/30'
                : 'border-emerald-400/90 shadow-emerald-500/30'
            }`}
          >
            {/* Corner Markers */}
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />

            {/* Red / Cyan Sweeping Laser Line */}
            {step !== 3 && (
              <div
                className={`absolute w-full h-0.5 animate-pulse shadow-md ${
                  step === 1 ? 'bg-cyan-400 shadow-cyan-400' : 'bg-amber-400 shadow-amber-400'
                }`}
                style={{
                  animation: 'scanLaser 1.8s ease-in-out infinite alternate',
                }}
              />
            )}

            {/* Instruction Badge Inside Reticle */}
            <div
              className={`px-3 py-1.5 rounded-full text-xs font-black tracking-wider uppercase backdrop-blur-md border ${
                step === 1
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                  : step === 2
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {step === 1 && '🎯 Point at Box Shipping Barcode'}
              {step === 2 && '🏷️ Point at ST Courier Docket'}
              {step === 3 && '✓ Dispatched'}
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center z-20">
            <RefreshCw className="w-10 h-10 text-amber-400 animate-spin mb-3" />
            <p className="text-sm font-black text-white">Validating Barcode...</p>
          </div>
        )}

        {/* Error Notification Toast */}
        {errorMessage && !permissionDenied && (
          <div className="absolute top-4 left-4 right-4 z-30 max-w-md mx-auto bg-red-600/95 text-white px-4 py-3 rounded-2xl shadow-2xl border border-red-400 flex items-start gap-3 backdrop-blur-md animate-bounce">
            <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-black">Scan Warning</p>
              <p className="mt-0.5 text-red-100">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-white/20 rounded-lg text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Camera Permission / Access Required Screen */}
        {permissionDenied && (
          <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-white">Camera Access Required</h3>
            <p className="text-xs text-slate-300 max-w-sm mt-1.5 leading-relaxed">
              {errorMessage || 'Your browser blocked camera access. Please allow Camera permission to scan barcodes.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5 w-full max-w-xs">
              <button
                type="button"
                onClick={() => startCamera()}
                className="py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Enable Camera / Retry</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualModal(true)}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Keyboard className="w-4 h-4 text-amber-400" />
                <span>Type Manually</span>
              </button>
            </div>

            <div className="mt-6 p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-400 text-left max-w-xs">
              <p className="font-bold text-slate-300 mb-1">💡 How to unblock in Chrome / Safari:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-[10px]">
                <li>Tap <strong>🔒 lock / tune icon</strong> in browser address bar</li>
                <li>Set <strong>Camera</strong> to <strong>Allow</strong></li>
                <li>Tap <strong>Enable Camera</strong> above</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Information & Control Tray */}
      <div className="p-4 bg-slate-900/95 border-t border-white/10 shrink-0 z-10 max-h-[45vh] overflow-y-auto">
        {/* Step 1: Ready to Scan */}
        {step === 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-300">Ready to Pack &amp; Ship</p>
                <p className="text-sm font-black text-white">Scan the Shipping Label barcode on the box</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowManualModal(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Keyboard className="w-4 h-4 text-cyan-400" />
              <span>Type Order ID Manually</span>
            </button>
          </div>
        )}

        {/* Step 2: Order Locked, Awaiting AWB */}
        {step === 2 && activeOrder && (
          <div className="space-y-3">
            <div className="bg-slate-800/80 border border-amber-500/40 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-amber-300">#{activeOrder.orderNumber}</span>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-bold">
                      {activeOrder.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white mt-0.5">
                    {activeOrder.studentName} · <span className="text-slate-300">{activeOrder.destination}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">
                    📚 {activeOrder.itemsSummary}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleResetForNext}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualModal(true)}
                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Type AWB</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-300 animate-pulse">
              <Truck className="w-4 h-4" />
              <span>Target camera at the ST Courier pre-printed AWB sticker now...</span>
            </div>
          </div>
        )}

        {/* Step 3: Success Dispatched View */}
        {step === 3 && dispatchResult && (
          <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-emerald-400 tracking-wider">
                      DISPATCHED SUCCESSFULLY
                    </span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      #{dispatchResult.orderNumber}
                    </span>
                  </div>
                  <p className="text-sm font-black text-white mt-0.5">
                    ST Courier AWB: <span className="text-amber-300 underline">{dispatchResult.awbNumber}</span>
                  </p>
                  <p className="text-xs text-slate-300">
                    To: {dispatchResult.studentName} ({dispatchResult.destination})
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-emerald-500/20">
              {dispatchResult.whatsAppShareUrl && (
                <a
                  href={dispatchResult.whatsAppShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all text-center"
                >
                  <Send className="w-4 h-4" />
                  <span>📲 Share Tracking on WhatsApp</span>
                </a>
              )}

              <a
                href={dispatchResult.stCourierUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                title="Verify on ST Courier official site"
              >
                <span>Track</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>

              <button
                type="button"
                onClick={handleResetForNext}
                className="py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <span>Next Parcel</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Entry Modal Fallback (Step-Aware) */}
      {showManualModal && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-amber-400" />
                <span>
                  {step === 1 || !activeOrder
                    ? 'Step 1: Enter Order Number'
                    : 'Step 2: Enter ST Courier AWB'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STEP 1: Enter Order Number only */}
            {(step === 1 || !activeOrder) && (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Enter the Order ID from the customer shipping label barcode to lock the parcel for dispatch.
                </p>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Order Number (e.g. BPG-1049 or 1049)
                  </label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Type or paste Order ID..."
                    value={manualOrderCode}
                    onChange={(e) => setManualOrderCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-cyan-300 focus:border-cyan-400 outline-none uppercase"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!manualOrderCode.trim()}
                    onClick={async () => {
                      const code = manualOrderCode.trim();
                      setShowManualModal(false);
                      setManualOrderCode('');
                      await handleOrderDetected(code);
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Find &amp; Lock Order</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Locked Order -> Enter ST Courier AWB only */}
            {step === 2 && activeOrder && (
              <div className="space-y-4">
                {/* Locked Order Summary Banner */}
                <div className="bg-slate-800/90 border border-amber-500/40 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-300">
                      Locked: #{activeOrder.orderNumber}
                    </span>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-bold">
                      {activeOrder.status}
                    </span>
                  </div>
                  <p className="text-white font-bold truncate">
                    {activeOrder.studentName} · <span className="text-slate-300">{activeOrder.destination}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    📚 {activeOrder.itemsSummary}
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    ST Courier AWB Docket Number
                  </label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Type 10-13 digit docket (e.g. 63660535761)..."
                    value={manualAwbCode}
                    onChange={(e) => setManualAwbCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-amber-300 focus:border-amber-400 outline-none uppercase"
                  />

                  {/* Real-time AWB Validation Feedback */}
                  <div className="mt-1.5">
                    {manualAwbCode.trim().length > 0 ? (
                      isOrderCode(manualAwbCode) ? (
                        <p className="text-[11px] text-red-400 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>⚠️ That is an Order ID! Enter the courier docket.</span>
                        </p>
                      ) : VALID_DOCKET_REGEX.test(cleanScannedCode(manualAwbCode)) ? (
                        <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>✓ Valid ST Courier Docket format</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-300">
                          10–13 digits required (e.g. 63660535761 or STC...)
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-slate-400">
                        Scan with camera or type the pre-printed sticker docket.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualModal(false);
                      setManualAwbCode('');
                    }}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveOrder(null);
                      setStep(1);
                      setManualOrderCode('');
                      setManualAwbCode('');
                    }}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                    title="Choose a different order"
                  >
                    Change Order
                  </button>
                  <button
                    type="button"
                    disabled={!VALID_DOCKET_REGEX.test(cleanScannedCode(manualAwbCode))}
                    onClick={async () => {
                      const awb = cleanScannedCode(manualAwbCode);
                      setShowManualModal(false);
                      setManualAwbCode('');
                      await handleAwbDetected(awb);
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Assign &amp; Dispatch</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Laser Scan Animation Keyframes */}
      <style jsx global>{`
        @keyframes scanLaser {
          0% {
            top: 5%;
          }
          100% {
            top: 92%;
          }
        }
      `}</style>
    </div>
  );
}
