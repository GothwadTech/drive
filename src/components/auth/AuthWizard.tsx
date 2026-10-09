import React, { useState, useEffect } from "react";
import { Phone, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Shield, Check, Sun, Moon } from "lucide-react";
import type { AuthState } from "../../types";

interface AuthWizardProps {
  state: AuthState;
  onPhoneSubmit: (phone: string) => void;
  onCredentialsSubmit?: (apiId: number, apiHash: string) => void;
  onOtpSubmit: (code: string) => void;
  onPasswordSubmit: (password: string) => void;
  onBackToCredentials?: () => void;
}

export function AuthWizard({
  state,
  onPhoneSubmit,
  onOtpSubmit,
  onPasswordSubmit,
}: AuthWizardProps) {
  const [phone, setPhone] = useState(state.phone || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [localError, setLocalError] = useState("");
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });

  useEffect(() => {
    if (state.phone && !phone) {
      setPhone(state.phone);
    }
  }, [state.phone, phone]);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.replace(/[\s()-]/g, "");

    if (!cleaned.startsWith("+")) {
      setLocalError("Phone number must include country code (e.g. +91XXXXXXXXXX)");
      return;
    }
    if (cleaned.length < 10 || cleaned.length > 16) {
      setLocalError("Please enter a valid international phone number");
      return;
    }

    setLocalError("");
    onPhoneSubmit(cleaned);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().replace(/\D/g, "");
    if (cleanCode.length !== 5) {
      setLocalError("Please enter the 5-digit verification code sent to Telegram");
      return;
    }

    setLocalError("");
    onOtpSubmit(cleanCode);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setLocalError("Please enter your 2-Step Verification cloud password");
      return;
    }

    setLocalError("");
    onPasswordSubmit(password);
  };

  const errorMessage = state.error || localError;

  return (
    <div className="min-h-screen h-full overflow-y-auto bg-white dark:bg-[#212121] text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center relative font-sans transition-colors duration-300 selection:bg-[#0494f4]/30 selection:text-white">
      {/* Background ambient accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none select-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-[100px] bg-[#0494f4]/15" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-[100px] bg-[#0494f4]/10 dark:bg-indigo-600/10" />
      </div>

      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-[#282828] dark:hover:bg-[#333333] border border-gray-200 dark:border-[#383838] text-gray-700 dark:text-gray-200 hover:text-[#0494f4] dark:hover:text-[#0494f4] transition-all cursor-pointer active:scale-95 shadow-sm z-20 flex items-center gap-1.5 text-xs font-semibold"
        title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
      >
        {isDark ? <Sun size={17} className="text-[#0494f4]" /> : <Moon size={17} className="text-[#0494f4]" />}
        <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
      </button>

      <div className="w-full px-5 sm:px-8 pt-10 sm:pt-12 pb-16 z-10 flex flex-col items-center min-h-full relative max-w-md mx-auto my-auto animate-fade-in">
        {/* Header Card */}
        <div className="w-full bg-white dark:bg-[#282828] border border-gray-200 dark:border-[#383838] rounded-2xl p-6 text-center flex flex-col items-center justify-center mb-5 shadow-sm dark:shadow-xl dark:shadow-black/20 transition-colors">
          <div className="w-16 h-16 bg-gray-50 dark:bg-[#1a1a1a] rounded-2xl shadow-inner flex items-center justify-center border border-gray-200 dark:border-[#383838] p-0 overflow-hidden mb-3.5 group transition-transform hover:scale-105">
            <img 
              src="/icon-512-maskable.png" 
              alt="Gothwad Drive Logo" 
              className="w-full h-full object-cover scale-105"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                if (!target.src.includes("favicon.ico")) {
                  target.src = "/favicon.ico";
                }
              }}
            />
          </div>
          <h2 className="text-[26px] font-black text-gray-900 dark:text-white tracking-tight mb-1">
            Gothwad Drive
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed max-w-[270px] mx-auto font-medium">
            {state.step === "otp"
              ? "Enter the 5-digit verification code sent to your Telegram app."
              : state.step === "password"
                ? "Two-Step Verification (2FA) is enabled. Enter your cloud password."
                : "Infinite, serverless cloud storage powered by Telegram MTProto."}
          </p>
        </div>

        {/* Step Status Tabs */}
        <div className="w-full flex p-1 gap-2 select-none mb-5 max-w-md bg-gray-100 dark:bg-[#282828] border border-gray-200 dark:border-[#383838] rounded-2xl transition-colors">
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-default flex items-center justify-center gap-1.5 ${
              state.step === "phone" || state.step === "credentials"
                ? "bg-[#0494f4] text-white shadow-md shadow-[#0494f4]/20"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <span>1. Phone</span>
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-default flex items-center justify-center gap-1.5 ${
              state.step === "otp"
                ? "bg-[#0494f4] text-white shadow-md shadow-[#0494f4]/20"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <span>2. Code</span>
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-default flex items-center justify-center gap-1.5 ${
              state.step === "password"
                ? "bg-[#0494f4] text-white shadow-md shadow-[#0494f4]/20"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <span>3. 2FA</span>
          </button>
        </div>

        {/* Active Form Card */}
        <div className="w-full bg-white dark:bg-[#282828] border border-gray-200 dark:border-[#383838] rounded-2xl p-6 shadow-sm dark:shadow-xl dark:shadow-black/20 transition-colors">
          {/* STEP 1: Phone */}
          {(state.step === "phone" || state.step === "credentials") && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="relative group">
                <Phone
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-[#0494f4] transition-colors"
                />
                <input
                  type="tel"
                  placeholder="+91 XXXXX XXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-12 pr-5 py-3.5 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#383838] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0494f4]/20 focus:border-[#0494f4] transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-white"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-between items-center px-1">
                <div
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-2.5 cursor-pointer group select-none py-1"
                >
                  <div
                    className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-all duration-200 ${
                      rememberMe
                        ? "bg-[#0494f4] border-[#0494f4] shadow-sm shadow-[#0494f4]/30"
                        : "bg-white dark:bg-[#1e1e1e] border-gray-300 dark:border-gray-600 group-hover:border-[#0494f4]"
                    }`}
                  >
                    {rememberMe && (
                      <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors select-none">
                    Remember session
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Telegram Account
                </span>
              </div>

              <button
                type="submit"
                disabled={state.loading || !phone.trim()}
                className="w-full bg-[#0494f4] hover:bg-[#0383d8] text-white text-sm font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 active:scale-[0.98] shadow-md shadow-[#0494f4]/25 mt-2 cursor-pointer flex items-center justify-center gap-2"
              >
                {state.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: OTP / Verification Code */}
          {state.step === "otp" && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#383838] rounded-xl p-3 flex items-center justify-between text-xs transition-colors">
                <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-mono">
                  <Phone size={14} className="text-[#0494f4]" />
                  <span>{phone || state.phone}</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  Code Sent
                </span>
              </div>

              <div className="relative group">
                <ShieldCheck
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-[#0494f4] transition-colors"
                />
                <input
                  type="text"
                  placeholder="5-digit Telegram Code"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full pl-12 pr-5 py-3.5 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#383838] rounded-xl text-base tracking-[0.25em] font-mono focus:outline-none focus:ring-2 focus:ring-[#0494f4]/20 focus:border-[#0494f4] transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:tracking-normal placeholder:font-sans text-gray-900 dark:text-white text-center sm:text-left"
                  autoFocus
                  required
                />
              </div>

              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                Check your active Telegram app on your phone or desktop for the login code.
              </p>

              <button
                type="submit"
                disabled={state.loading || code.trim().length !== 5}
                className="w-full bg-[#0494f4] hover:bg-[#0383d8] text-white text-sm font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 active:scale-[0.98] shadow-md shadow-[#0494f4]/25 mt-2 cursor-pointer flex items-center justify-center gap-2"
              >
                {state.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Access Drive</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 3: 2FA Password */}
          {state.step === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative group">
                <Lock
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-[#0494f4] transition-colors"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter 2FA Cloud Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3.5 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#383838] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0494f4]/20 focus:border-[#0494f4] transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-white"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                This Telegram account is protected by an additional cloud password.
              </p>

              <button
                type="submit"
                disabled={state.loading || !password.trim()}
                className="w-full bg-[#0494f4] hover:bg-[#0383d8] text-white text-sm font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 active:scale-[0.98] shadow-md shadow-[#0494f4]/25 mt-2 cursor-pointer flex items-center justify-center gap-2"
              >
                {state.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Unlocking Drive...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock Gothwad Drive</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Error display */}
          {errorMessage && (
            <div className="mt-4 text-red-500 text-xs font-semibold text-center bg-red-500/10 py-2.5 px-4 rounded-xl border border-red-500/20 leading-relaxed">
              {errorMessage}
            </div>
          )}

          {/* Security details badge */}
          <div className="mt-5 pt-4 border-t border-gray-200 dark:border-white/5 flex items-center justify-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 select-none">
            <Shield size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span>End-to-End Encrypted via Telegram MTProto</span>
          </div>
        </div>

        {/* Footer Gothwad / Atmanirbhar Bharat Branding Card */}
        <div className="w-full bg-white dark:bg-[#282828] border border-gray-200 dark:border-[#383838] rounded-2xl p-5 text-center flex flex-col items-center justify-center mt-5 shadow-sm select-none gap-3.5 transition-colors">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-[280px] mx-auto">
            By using <span className="font-bold text-[#0494f4]">Gothwad Drive</span>, you agree to our{" "}
            <span className="font-bold text-[#0494f4] hover:underline cursor-pointer">
              Terms of Service
            </span>{" "}
            &{" "}
            <span className="font-bold text-[#0494f4] hover:underline cursor-pointer">
              Privacy Policy
            </span>.
          </p>
          <div className="w-full h-[1px] bg-gray-200 dark:bg-white/10"></div>
          <div className="text-center max-w-[280px] mx-auto">
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400/80 block leading-relaxed">
              <span className="font-bold text-[#0494f4]">Gothwad Drive</span> is proudly developed and managed by{" "}
              <a
                href="https://gothwadtechnologies.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#0494f4] hover:underline cursor-pointer decoration-[#0494f4] decoration-2"
              >
                Gothwad
              </a>{" "}
              in support of India&apos;s Atmanirbhar Bharat initiative. If you have any concerns, please{" "}
              <a
                href="mailto:support@gothwadtechnologies.com"
                className="font-bold text-[#0494f4] hover:underline cursor-pointer decoration-[#0494f4] decoration-2"
              >
                contact us
              </a>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
