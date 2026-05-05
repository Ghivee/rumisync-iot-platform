import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Home, Activity, Leaf, Settings, Bell, X, Menu, CheckCircle2 } from "lucide-react";
import { Toaster } from "./ui/sonner";
import logoImg from '../../assets/logo.png';
import { useCattle } from "../context/CattleContext";

// Custom Battery Icon Component (Solid Fill)
const BatteryIndicator = ({ level }: { level: number }) => {
  const getColors = () => {
    if (level > 20) return { fill: "#4c7766", border: "border-rs-sage", icon: "bg-[#6b8e7b]" };
    if (level > 10) return { fill: "#d97706", border: "border-amber-500", icon: "bg-amber-500" };
    return { fill: "#c25944", border: "border-[#c25944]", icon: "bg-[#c25944]" };
  };

  const { fill, border, icon } = getColors();

  return (
    <div className="flex items-center gap-1.5" title={`${Math.round(level)}% Battery`}>
      <div className={`relative w-8 h-[16px] border-[2px] ${border} rounded-[4px] p-[1.5px] flex items-center bg-rs-card`}>
        <div className="w-full h-full rounded-[1px] overflow-hidden flex justify-start">
          <div 
            className="h-full transition-all duration-1000 ease-in-out"
            style={{ width: `${level}%`, backgroundColor: fill, borderRadius: level === 100 ? '1px' : '1px 0 0 1px' }}
          />
        </div>
        <div className={`absolute -right-[4px] top-1/2 -translate-y-1/2 w-[2.5px] h-[6px] ${icon} rounded-r-sm`} />
      </div>
      <span className="text-xs sm:text-sm font-bold text-rs-text min-w-[33px]">
        {Math.round(level)}%
      </span>
    </div>
  );
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(65);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const { notifications, markNotificationAsRead, setSelectedCattleId } = useCattle();

  useEffect(() => {
    const timer = setInterval(() => {
      setBatteryLevel((prev) => (prev <= 1 ? 100 : prev - 1));
    }, 120000); 
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  const isActive = (path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = (notif: any) => {
    markNotificationAsRead(notif.id);
    if (notif.cattleId) {
      setSelectedCattleId(notif.cattleId);
      navigate("/medical");
      setShowNotifications(false);
    }
  };

  const navigationItems = [
    { path: "/", icon: Home, label: "Beranda" },
    { path: "/medical", icon: Activity, label: "Medis" },
    { path: "/eco-nutrition", icon: Leaf, label: "Nutrisi" },
    { path: "/system-control", icon: Settings, label: "Sistem" }
  ];

  return (
    <div className="flex flex-col md:flex-row bg-rs-bg selection:bg-rs-primary selection:text-white w-full overflow-x-hidden" style={{ height: '100dvh', minHeight: '-webkit-fill-available' }}>
      <Toaster position="top-center" richColors />
      
      {/* Sidebar for Tablet (md) and Desktop (lg) */}
      <aside className="hidden md:flex flex-col bg-rs-card border-r border-rs-border shadow-sm z-30 transition-all duration-300 w-24 lg:w-72">
        <div className="p-4 lg:p-6 border-b border-rs-border flex items-center justify-center lg:justify-start gap-4">
          <Link to="/" className="w-14 h-14 flex items-center justify-center flex-shrink-0 bg-rs-sage-light rounded-xl overflow-hidden p-1.5 hover:scale-105 transition-transform">
            <img src={logoImg} alt="RumiSync Logo" className="w-full h-full object-contain drop-shadow-sm scale-110" />
          </Link>
          <Link to="/" className="hidden lg:block text-2xl font-black text-rs-primary tracking-tight hover:opacity-80 transition-opacity">
            RUMI-SYNC
          </Link>
        </div>
        
        <div className="flex-1 py-8 flex flex-col gap-3 px-3 lg:px-4">
          {navigationItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`flex items-center lg:justify-start justify-center gap-4 px-3 lg:px-5 py-4 rounded-2xl transition-all font-bold min-h-[56px] group ${
                  active 
                    ? "bg-rs-border text-rs-primary shadow-[inset_4px_0_0_#4c7766]" 
                    : "text-rs-muted hover:bg-rs-sage-light hover:text-rs-primary"
                }`}
              >
                <item.icon className={`w-7 h-7 flex-shrink-0 transition-transform group-hover:scale-110 ${active ? "fill-[#4c7766]/20" : ""}`} />
                <span className="hidden lg:block text-[17px]">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-rs-border flex justify-center lg:justify-start items-center gap-3">
          <BatteryIndicator level={batteryLevel} />
          <div className="hidden lg:block text-xs font-bold text-rs-muted">
            Hardware Aktif
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Header - shrink-0 so it never gets squished */}
        <header className="bg-rs-card border-b border-rs-border px-4 sm:px-8 py-4 flex items-center justify-between z-30 shadow-sm shrink-0">
          <Link to="/" className="flex items-center gap-3 md:hidden group">
            <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 bg-rs-sage-light rounded-xl p-1.5 shadow-sm group-hover:scale-105 transition-transform">
              <img src={logoImg} alt="RumiSync Logo" className="w-full h-full object-contain scale-110" />
            </div>
            <div className="text-xl font-black text-rs-primary tracking-tight group-hover:opacity-80 transition-opacity">RUMI-SYNC</div>
          </Link>
          
          {/* Desktop/Tablet Global Context Header Items */}
          <div className="hidden md:flex flex-1 items-center justify-between">
            <div className="text-rs-muted font-medium text-sm lg:text-base">
              Beranda {location.pathname !== '/' && `> ${navigationItems.find(n => isActive(n.path))?.label}`}
            </div>

            <div className="flex items-center gap-6">
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-3 bg-rs-bg border border-rs-border text-rs-primary hover:bg-rs-border rounded-2xl transition-all min-h-[56px] min-w-[56px] flex items-center justify-center shadow-sm"
                >
                  <Bell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2.5 right-2.5 min-w-5 h-5 px-1 bg-[#c25944] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-rs-card">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 top-16 w-80 md:w-96 bg-rs-card rounded-3xl shadow-xl border border-rs-border z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden flex flex-col max-h-[500px]">
                    <div className="flex items-center justify-between p-5 border-b border-rs-border bg-rs-card-sub shrink-0">
                      <h3 className="font-bold text-rs-text text-lg">Notifikasi Sistem</h3>
                      <button onClick={() => setShowNotifications(false)} className="p-2 hover:bg-rs-border rounded-full text-rs-sage">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                      {notifications.length > 0 ? notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                            notif.isRead 
                              ? "bg-rs-card border-[#f4f5f2] hover:bg-[#f8f9f7]" 
                              : "bg-rs-card-sub border-rs-border hover:bg-rs-border/50"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
                              notif.type === "warning" ? "bg-[#c25944]" : notif.type === "success" ? "bg-rs-primary" : "bg-[#d97706]"
                            }`}></div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-relaxed ${notif.isRead ? "text-rs-muted font-medium" : "text-rs-text font-bold"}`}>
                                {notif.message}
                              </p>
                              {notif.cattleId && (
                                <div className="mt-2 inline-block px-2 py-1 bg-rs-sage-light rounded-md text-[10px] font-bold text-rs-sage">
                                  Terkait: {notif.cattleId}
                                </div>
                              )}
                              <p className="text-xs font-semibold text-[#8ca195] mt-1.5">{notif.time}</p>
                            </div>
                            {notif.isRead && <CheckCircle2 className="w-4 h-4 text-[#e2e8e4]" />}
                          </div>
                        </div>
                      )) : (
                        <div className="p-6 text-center text-rs-muted font-medium">Belum ada notifikasi</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Right Controls */}
          <div className="flex md:hidden items-center gap-3">
            <BatteryIndicator level={batteryLevel} />
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-rs-primary bg-rs-bg border border-rs-border rounded-xl relative hover:bg-rs-border transition-colors">
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#c25944] rounded-full border-2 border-rs-card"></span>}
            </button>
          </div>
        </header>

        {/* Mobile Slide-down Menu for Notifications */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-rs-card border-b border-rs-border p-4 animate-in slide-in-from-top-2 z-10 relative shadow-md max-h-[60vh] overflow-y-auto">
             <div className="mb-4 font-bold text-rs-text text-lg">Notifikasi Sistem</div>
             <div className="space-y-2">
               {notifications.length > 0 ? notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    onClick={() => { handleNotificationClick(notif); setMobileMenuOpen(false); }}
                    className={`p-4 rounded-xl border cursor-pointer ${
                      notif.isRead ? "bg-rs-card border-[#f4f5f2]" : "bg-rs-card-sub border-rs-border"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${notif.type === "warning" ? "bg-[#c25944]" : "bg-rs-primary"}`}></div>
                      <div>
                        <p className={`text-sm ${notif.isRead ? "text-rs-muted font-medium" : "text-rs-text font-bold"}`}>{notif.message}</p>
                        <p className="text-xs font-semibold text-[#8ca195] mt-1">{notif.time}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-rs-muted">Tidak ada notifikasi aktif.</p>
                )}
             </div>
          </div>
        )}

        {/* Main Routed Content - flex-1 + overflow-y-auto is the correct scroll pattern */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-rs-bg">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation - shrink-0 keeps it at bottom of flex column */}
        <nav className="md:hidden bg-rs-card border-t border-rs-border px-2 py-3 z-40 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex justify-around items-center max-w-lg mx-auto">
            {navigationItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-1.5 min-w-[72px] min-h-[56px] justify-center px-1 py-2 rounded-2xl transition-all ${active ? "bg-rs-border text-rs-primary font-bold scale-105" : "text-rs-muted hover:bg-rs-sage-light hover:text-rs-primary"}`}>
                  <item.icon className={`w-7 h-7 ${active ? "fill-[#4c7766]/20" : ""}`} />
                  <span className="text-[11px] leading-tight font-semibold">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}