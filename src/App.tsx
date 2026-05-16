/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  setDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  onAuthStateChanged, 
  User
} from 'firebase/auth';
import { 
  LayoutDashboard, 
  Users, 
  PlusCircle, 
  LogOut, 
  ChevronRight, 
  Camera, 
  Trash2, 
  Edit, 
  X, 
  Gamepad2, 
  ArrowLeft,
  Search,
  BookOpen,
  LogIn,
  Heart,
  Laptop,
  Code2,
  Wifi,
  UserCircle,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AOS from 'aos';
import confetti from 'canvas-confetti';
import firebaseConfig from '../firebase-applet-config.json';
import { FoodArticle, SubSection, ViewState } from './types.ts';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Path constant
const FOODS_PATH = `artifacts/${firebaseConfig.appId}/public/data/foods`;

// Global variable for ReferenceError prevention
declare global {
  interface Window {
    editingId: string | null;
  }
}
window.editingId = null;

// --- UTILS ---
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
  });
};

// --- COMPONENTS ---

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  key?: React.Key;
}

const Toast = ({ message, type, onClose }: ToastProps) => (
  <div className="toast" style={{ borderColor: type === 'success' ? '#c5a059' : '#ef4444' }}>
    {type === 'success' ? <div className="w-2 h-2 rounded-full bg-gold" /> : <div className="w-2 h-2 rounded-full bg-red-500" />}
    {message}
    <button onClick={onClose} className="ml-2 hover:text-gold transition-colors"><X size={14} /></button>
  </div>
);

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [posts, setPosts] = useState<FoodArticle[]>([]);
  const [selectedPost, setSelectedPost] = useState<FoodArticle | null>(null);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number, message: string, type: 'success' | 'error' }[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const [adminUsername, setAdminUsername] = useState("");
  const [adminPin, setAdminPin] = useState("");

  const [formData, setFormData] = useState<FoodArticle>({
    title: "",
    summary: "",
    coverImage: "",
    subSections: [],
    author: "Tim InfoPapeda",
    createdAt: Date.now()
  });
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);

  useEffect(() => {
    AOS.init({ duration: 1000, once: true });
    
    // Listen for auth state without auto-signing in anonymously (which can error if not enabled)
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });

    const q = query(collection(db, FOODS_PATH), orderBy('createdAt', 'desc'));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodArticle));
      setPosts(data);
    });

    return () => {
      unsubscribeAuth();
      unsubscribePosts();
    };
  }, []);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUsername === "admin" && adminPin === "1234") {
      try {
        // Step 1: Login with Google to satisfy Firebase Auth requirement for write rules
        addToast("Sila konfirmasi identitas Kurator via Google...", "success");
        const result = await signInWithPopup(auth, googleProvider);
        const currentUser = result.user;
        setUser(currentUser);

        // Step 2: Register/Verify admin in Firestore
        const adminDoc = doc(db, 'admins', currentUser.uid);
        await setDoc(adminDoc, { 
          username: adminUsername, 
          role: 'owner', 
          updatedAt: serverTimestamp(),
          isAuthorized: true 
        }, { merge: true });
        
        setIsAdminMode(true);
        setView('ADMIN_DASHBOARD');
        addToast(`Akses Diberikan. Selamat Datang, Kurator ${currentUser.displayName || ''}!`, "success");
      } catch (err: any) {
        console.error("Admin Login Error:", err);
        addToast("Gagal memverifikasi identitas admin melalui Google.", "error");
      }
    } else {
      addToast("Username atau PIN salah!", "error");
    }
  };

  const handleSavePost = async () => {
    if (!formData.title || !formData.coverImage) {
      addToast("Judul dan Foto Sampul wajib diisi!", "error");
      return;
    }
    
    if (!isAdminMode) {
      addToast("Anda harus login sebagai admin untuk menyimpan.", "error");
      return;
    }

    try {
      if (isEditing && window.editingId) {
        await updateDoc(doc(db, FOODS_PATH, window.editingId), { 
          ...formData,
          updatedAt: serverTimestamp()
        });
        addToast("Postingan berhasil diperbarui!", "success");
      } else {
        await addDoc(collection(db, FOODS_PATH), { 
          ...formData, 
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        addToast("Postingan baru berhasil ditambahkan!", "success");
      }
      resetForm();
    } catch (err: any) { 
      console.error("Save error detail:", err);
      // Specific error handling for permissions
      if (err.code === 'permission-denied') {
        addToast("Izin Ditolak: Database belum mengenali status admin Anda.", "error");
      } else {
        addToast(`Gagal menyimpan: ${err.message || "Masalah Koneksi"}`, "error"); 
      }
    }
  };

  const resetForm = () => {
    setFormData({ title: "", summary: "", coverImage: "", subSections: [], author: "Tim InfoPapeda", createdAt: Date.now() });
    setIsEditing(false);
    window.editingId = null;
    setShowCreateForm(false);
  };

  const startEditing = (post: FoodArticle) => {
    setFormData(post);
    setIsEditing(true);
    window.editingId = post.id || null;
    setView('ADMIN_DASHBOARD');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addSubSection = () => setFormData({ ...formData, subSections: [...formData.subSections, { title: "", description: "", image: "" }] });
  const updateSubSection = (index: number, field: keyof SubSection, value: string) => {
    const newSubSections = [...formData.subSections];
    newSubSections[index] = { ...newSubSections[index], [field]: value };
    setFormData({ ...formData, subSections: newSubSections });
  };
  const removeSubSection = (index: number) => setFormData({ ...formData, subSections: formData.subSections.filter((_, i) => i !== index) });

  const handleFileUpload = async (index: number | null, file: File) => {
    const base64 = await compressImage(file);
    if (index === null) setFormData({ ...formData, coverImage: base64 });
    else updateSubSection(index, 'image', base64);
  };

  const renderRightSidebar = () => (
    <>
      {/* Overlay when sidebar is open */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed right-0 top-0 h-screen w-64 bg-deep-brown text-cream z-50 flex flex-col border-l border-gold/20 shadow-2xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between border-b border-white/10">
          <span className="font-serif text-xl font-bold tracking-widest text-gold">Akun & Navigasi</span>
          <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        <nav className="flex-1 mt-6 space-y-2 px-4">
          {[
            { icon: <LayoutDashboard />, label: "Beranda", view: 'HOME' as ViewState },
            { icon: <Users />, label: "Tim Kurator", view: 'PROFILE' as ViewState },
            { icon: <Gamepad2 />, label: "Sago Pop", view: 'GAME' as ViewState },
            { icon: <PlusCircle />, label: isAdminMode ? "Dashboard Admin" : "Login Admin", view: isAdminMode ? 'ADMIN_DASHBOARD' as ViewState : 'ADMIN_LOGIN' as ViewState },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { setView(item.view); setIsSidebarOpen(false); }}
              className={`w-full flex items-center justify-start gap-4 p-4 rounded-xl transition-all ${view === item.view ? 'bg-gold text-deep-brown shadow-[0_0_15px_rgba(197,160,89,0.3)]' : 'hover:bg-white/5 text-gray-400'}`}
            >
              {item.icon}
              <span className="font-sans font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
        {isAdminMode && (
          <div className="p-4 border-t border-white/10">
            <button onClick={() => { setIsAdminMode(false); setView('HOME'); setIsSidebarOpen(false); addToast("Admin Logged Out"); }} className="w-full flex items-center justify-start gap-4 p-4 text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
              <LogOut /><span className="font-sans font-medium text-sm">Keluar Admin</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );

  const renderNavbar = () => (
    <nav className="fixed top-0 left-0 right-0 h-20 bg-deep-brown/95 backdrop-blur-md border-b border-gold/20 z-30 px-6 md:px-12 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('HOME')}>
        <div className="w-10 h-10 bg-gold rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-deep-brown font-serif font-bold text-xl">IP</span>
        </div>
        <span className="hidden sm:block font-serif text-xl font-bold tracking-widest text-gold text-nowrap">InfoPapeda</span>
      </div>

      {/* Main Menu Items (Desktop) */}
      <div className="hidden md:flex items-center gap-8">
        {[
          { label: 'Sejarah', view: 'SEJARAH' as ViewState },
          { label: 'Filosofi', view: 'FILOSOFI' as ViewState },
          { label: 'Tim Kurator', view: 'PROFILE' as ViewState },
          { label: 'Kontak', view: 'CONTACT' as ViewState }
        ].map((item) => (
          <button 
            key={item.label}
            onClick={() => setView(item.view)}
            className={`font-sans text-sm tracking-widest uppercase transition-colors ${view === item.view ? 'text-gold font-bold' : 'text-cream/80 hover:text-gold'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        {/* Profile / Menu button */}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="text-gold p-2 hover:bg-white/5 rounded-full transition-colors flex items-center gap-2"
        >
          <span className="hidden sm:block font-sans text-xs uppercase tracking-widest text-cream/70">
            {isAdminMode ? 'Admin' : 'Menu'}
          </span>
          <UserCircle size={28} />
        </button>
      </div>
    </nav>
  );

  const renderHome = () => (
    <div className="animate-in fade-in duration-700">
      <section className="relative h-[80vh] w-full overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80')] bg-cover bg-center">
          <div className="absolute inset-0 bg-deep-brown/70 backdrop-blur-[2px]" />
        </div>
        <div className="relative text-center px-6 z-10" data-aos="zoom-out">
          <h2 className="text-gold font-sans tracking-[0.4em] uppercase text-sm mb-4 font-bold">Citarasa Luhur Tanah Papua</h2>
          <h1 className="text-white text-4xl md:text-5xl lg:text-6xl font-serif mb-8 leading-tight">Papeda membawa rasa rumah di tengah<br/> <span className="italic">dunia yang terus berubah</span></h1>
          <div className="w-24 h-1 bg-gold mx-auto mb-8" />
          <p className="text-cream/80 max-w-2xl mx-auto font-sans leading-relaxed tracking-wide text-lg md:text-xl">InfoPapeda menyajikan kehangatan tradisi dalam balutan kemewahan kontemporer.</p>
          <button onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })} className="mt-12 lux-btn-primary scale-110">Lihat Menu & Artikel</button>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-gold text-xs uppercase tracking-widest font-bold">Gulir Jelajahi</span>
          <div className="w-px h-12 bg-white/30" />
        </div>
      </section>
      <section id="catalog" className="py-24 px-6 md:px-12 bg-cream">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div data-aos="fade-right">
              <h3 className="text-gold font-sans tracking-widest uppercase text-xs font-bold mb-2">Kurasi Terbaik</h3>
              <h2 className="text-deep-brown text-4xl md:text-5xl font-serif">Katalog Rasa & Cerita</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {posts.map((post, idx) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }} viewport={{ once: true }} className="group lux-card overflow-hidden rounded-2xl flex flex-col h-full bg-white">
                <div className="h-64 overflow-hidden relative">
                  <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-deep-brown/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                    <button onClick={() => { setSelectedPost(post); setView('DETAIL'); }} className="text-white flex items-center gap-2 font-sans font-bold text-sm tracking-widest uppercase">Lihat Detail <ChevronRight size={16} className="text-gold" /></button>
                  </div>
                </div>
                <div className="p-8 flex-1 flex flex-col">
                  <h3 className="text-2xl font-serif text-deep-brown mb-4 group-hover:text-gold transition-colors">{post.title}</h3>
                  <p className="text-gray-500 line-clamp-3 font-sans text-sm leading-relaxed mb-6 flex-1">{post.summary}</p>
                  <div className="pt-6 border-t border-gold/10 flex justify-between items-center mt-auto">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gold">{post.author}</span>
                    <button onClick={() => { setSelectedPost(post); setView('DETAIL'); }} className="lux-btn-secondary py-1 text-xs px-4">Baca Selengkapnya</button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const renderFooter = () => (
    <footer className="lux-footer relative overflow-hidden">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 items-center text-center md:text-left relative z-10">
        <div>
          <h4 className="text-2xl font-serif text-gold mb-4 select-none">InfoPapeda.id</h4>
          <p className="text-sm text-gray-400 font-sans leading-loose">Menjaga tradisi kuliner Papua tetap hidup dan megah di era modern.</p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="flex justify-center gap-8">
            <button onClick={() => { setView('ABOUT'); window.scrollTo(0,0); }} className="text-gray-400 font-sans text-sm hover:text-gold transition-colors">Tentang Kami</button>
            <button onClick={() => { setView('CONTACT'); window.scrollTo(0,0); }} className="text-gray-400 font-sans text-sm hover:text-gold transition-colors">Kontak</button>
          </div>
          <div className="flex justify-center gap-8">
            <a href="#" className="text-gray-400 hover:text-gold transition-colors"><i className="fab fa-instagram text-xl"></i></a>
            <a href="#" className="text-gray-400 hover:text-gold transition-colors"><i className="fab fa-facebook text-xl"></i></a>
            <a href="#" className="text-gray-400 hover:text-gold transition-colors"><i className="fab fa-youtube text-xl"></i></a>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Hak Cipta <span onClick={() => { setView('GAME'); window.scrollTo(0,0); }} className="cursor-pointer hover:text-gold transition-colors p-1" title="Sago Pop Game">©</span> 2026
          </p>
          <p className="text-sm text-gray-400 font-serif italic italic hover:text-gold/80 transition-colors">
            "Dari Sagu, Menjadi Beribu <span onClick={() => { setView('DEVELOPER_INFO'); window.scrollTo(0,0); }} className="cursor-pointer hover:underline">Cerita</span>"
          </p>
        </div>
      </div>
      
      {/* Super Hidden Trigger for Developer Info - A tiny dot at the bottom right */}
      <div 
        onClick={() => { setView('DEVELOPER_INFO'); window.scrollTo(0,0); }}
        className="absolute bottom-2 right-2 w-1 h-1 bg-white/5 cursor-pointer hover:bg-gold/20 transition-colors rounded-full"
        title="Developer Access"
      />
    </footer>
  );

  const renderAbout = () => (
    <div className="animate-in fade-in duration-700 bg-gray-50 min-h-screen">
      <div className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-10"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-gold font-sans tracking-[0.4em] uppercase text-sm mb-4 font-bold">Tentang Kami</h2>
          <h1 className="text-4xl md:text-6xl font-serif text-deep-brown mb-8 leading-tight">Melestarikan Citarasa Luhur Papua</h1>
          <div className="w-24 h-1 bg-gold mx-auto mb-10" />
          <p className="text-gray-600 font-sans leading-relaxed text-lg md:text-xl text-justify mb-8">
            InfoPapeda didirikan dengan satu misi mulia: melestarikan dan memperkenalkan kekayaan kuliner tradisional Papua, khususnya Papeda, kepada dunia melalui platform yang elegan dan modern.
          </p>
          <p className="text-gray-600 font-sans leading-relaxed text-lg md:text-xl text-justify">
            Kami percaya bahwa setiap hidangan memiliki cerita, dan Papeda adalah narasi panjang tentang kearifan lokal, ketahanan pangan, dan kebersamaan keluarga di tanah Papua. Melalui InfoPapeda, kami mengundang Anda untuk menjelajahi kembali warisan rasa nusantara yang autentik.
          </p>
        </div>
      </div>
    </div>
  );

  const renderContact = () => (
    <div className="animate-in fade-in duration-700 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-gold font-sans tracking-[0.4em] uppercase text-sm mb-4 font-bold">Hubungi Kami</h2>
            <h1 className="text-4xl md:text-5xl font-serif text-deep-brown mb-8 leading-tight">Mari Berbincang tentang Rasa & Tradisi</h1>
            <p className="text-gray-500 font-sans leading-relaxed text-lg mb-12">
              Punya pertanyaan seputar kuliner Papua atau ingin berkolaborasi bersama InfoPapeda? Kami selalu terbuka untuk mendengar dari Anda.
            </p>
            
            <div className="space-y-6 font-sans">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gold/10 rounded-full flex items-center justify-center text-gold">
                  <span className="font-bold text-xl">L</span>
                </div>
                <div>
                  <h4 className="font-bold text-deep-brown">Lokasi</h4>
                  <p className="text-gray-500 text-sm">SMA Negeri 1 Purwareja Klampok, Jawa Tengah</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gold/10 rounded-full flex items-center justify-center text-gold">
                  <span className="font-bold text-xl">@</span>
                </div>
                <div>
                  <h4 className="font-bold text-deep-brown">Email</h4>
                  <p className="text-gray-500 text-sm">infopapeda1@gmail.com</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 p-8 md:p-12 rounded-3xl border border-gold/20 shadow-xl">
            <h3 className="text-2xl font-serif text-deep-brown mb-8">Kirim Pesan</h3>
            <form className="space-y-6" onSubmit={(e) => { 
                e.preventDefault(); 
                const form = e.target as HTMLFormElement;
                const name = (form.elements.namedItem('nama') as HTMLInputElement).value;
                const email = (form.elements.namedItem('email') as HTMLInputElement).value;
                const pesan = (form.elements.namedItem('pesan') as HTMLTextAreaElement).value;
                
                const subject = encodeURIComponent(`Pesan dari ${name} - InfoPapeda`);
                const body = encodeURIComponent(`${pesan}\n\n---\nDari: ${name}\nEmail: ${email}`);
                
                window.location.href = `mailto:infopapeda1@gmail.com?subject=${subject}&body=${body}`;
                
                addToast("Membuka aplikasi email kamu...", "success"); 
                form.reset();
              }}>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Nama Lengkap</label>
                <input name="nama" type="text" required className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold transition-colors" placeholder="Masukkan nama..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Email</label>
                <input name="email" type="email" required className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold transition-colors" placeholder="Masukkan email..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Pesan</label>
                <textarea name="pesan" required rows={4} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold transition-colors resize-none" placeholder="Apa yang ingin Anda sampaikan?"></textarea>
              </div>
              <button type="submit" className="w-full lux-btn-primary py-4 mt-4">Kirim Via Email</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDeveloperInfo = () => (
    <div className="p-6 md:p-24 bg-deep-brown min-h-screen flex items-center justify-center text-cream">
      <div className="max-w-4xl w-full bg-white/5 border border-gold/30 rounded-3xl p-8 md:p-12 backdrop-blur-xl shadow-2xl relative overflow-hidden" data-aos="zoom-in">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          {/* Removed Heart icon as requested */}
        </div>
        
        <button onClick={() => setView('HOME')} className="mb-12 text-gold flex items-center gap-2 hover:underline font-sans text-xs uppercase tracking-widest font-bold relative z-10"><ArrowLeft size={16} /> Kembali ke Galeri</button>
        
        <div className="text-center mb-12 relative z-10">
          <div className="w-32 h-32 bg-gold/20 rounded-full mx-auto flex items-center justify-center mb-8 border-4 border-gold/40 shadow-2xl overflow-hidden">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Gibran_Rakabuming_2024_official_portrait.jpg/500px-Gibran_Rakabuming_2024_official_portrait.jpg" alt="Developer" className="w-full h-full object-cover transition-all duration-700" />
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-gold mb-4">Gibran</h2>
          <p className="text-gray-400 font-sans tracking-widest uppercase text-xs">Architect of The Digital Realm</p>
        </div>

        <div className="space-y-10 relative z-10">
          <div className="border-l-4 border-gold pl-8 py-2">
            <p className="text-gray-300 font-serif text-xl md:text-2xl leading-relaxed italic">"Di balik layar bercahaya, bait-bait kode meramu masa depan. Teknologi tak lagi sekadar mesin yang dingin—ia adalah detak nadi peradaban, nafas dari jiwa-jiwa yang menolak diam."</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/5 p-8 rounded-2xl border border-white/10 hover:border-gold/30 transition-colors">
              <h5 className="text-gold font-sans font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><Laptop size={16} /> Perangkat Tempur</h5>
              <ul className="space-y-3 font-sans text-gray-300 text-sm">
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold"></div> DELL Latitude E7270</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold"></div> POCO X8 Pro Max</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold"></div> Infinix Note 12 2023</li>
              </ul>
            </div>
            <div className="bg-white/5 p-8 rounded-2xl border border-white/10 hover:border-gold/30 transition-colors">
              <h5 className="text-gold font-sans font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><Code2 size={16} /> Senjata Digital</h5>
              <ul className="space-y-3 font-sans text-gray-300 text-sm">
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Gemini Pro (AI Studio)</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div> React, Tailwind CSS, Vite</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Firebase (DB & Auth)</li>
              </ul>
            </div>
          </div>

          <div className="bg-white/5 p-8 rounded-2xl border border-white/10 hover:border-gold/30 transition-colors">
            <h5 className="text-gold font-sans font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><Wifi size={16} /> Infrastruktur & Biaya (Langganan)</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <p className="text-gray-400 text-xs mb-1">Internet Axis</p>
                <p className="font-serif text-lg text-white">Rp 100.000 <span className="text-sm text-gray-500">/ bulan</span></p>
              </div>
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <p className="text-gray-400 text-xs mb-1">Wi-Fi Kontrakan</p>
                <p className="font-serif text-lg text-white">Rp 200.000 <span className="text-sm text-gray-500">/ bulan</span></p>
              </div>
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <p className="text-gray-400 text-xs mb-1">Google Gemini Pro / Advanced</p>
                <p className="font-serif text-lg text-white">Rp 987.000 <span className="text-sm text-gray-500">/ 3 bulan</span></p>
              </div>
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <p className="text-gray-400 text-xs mb-1">Firebase Backend</p>
                <p className="font-serif text-lg text-white">Gratis <span className="text-sm text-gray-500">(Spark Tier)</span></p>
              </div>
            </div>
            
            <div className="mt-6 bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-center">
              <p className="text-sm text-green-200">
                <span className="font-bold">Hosting Aplikasi:</span> Kita menggunakan fitur web hosting gratis dari <span className="text-white">GitHub Pages</span> untuk meng-online-kan website ini! 🚀
              </p>
            </div>
          </div>
          
          <p className="text-center text-gray-500 font-sans text-[10px] uppercase tracking-[0.3em] font-bold mt-12 opacity-50">Karya Ini Didedikasikan Untuk Kehidupan</p>
        </div>
      </div>
    </div>
  );

  const renderDetail = () => {
    if (!selectedPost) return null;
    return (
      <div className="bg-white animate-in slide-in-from-right-10 duration-500 min-h-screen">
        <div className="relative h-[60vh]">
          <img src={selectedPost.coverImage} alt={selectedPost.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-white" />
          <button onClick={() => setView('HOME')} className="absolute top-8 left-8 bg-white/20 backdrop-blur-md text-white p-3 rounded-full hover:bg-gold transition-all"><ArrowLeft /></button>
        </div>
        <div className="max-w-4xl mx-auto -mt-32 relative bg-white rounded-t-3xl p-8 md:p-16 shadow-2xl">
          <div className="text-center mb-16" data-aos="fade-up">
            <span className="text-gold font-sans font-bold tracking-[0.3em] uppercase text-xs">Artikel Eksklusif</span>
            <h1 className="text-4xl md:text-6xl font-serif text-deep-brown mt-4 mb-8">{selectedPost.title}</h1>
            <div className="flex items-center justify-center gap-6 text-gray-400 font-sans text-xs uppercase tracking-widest mb-10">
              <span className="flex items-center gap-2"><Users size={14} className="text-gold" /> {selectedPost.author}</span>
              <span className="w-1 h-1 bg-gold rounded-full" />
              <span>{new Date(selectedPost.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <p className="text-lg text-gray-600 font-sans leading-loose italic">{selectedPost.summary}</p>
          </div>
          <div className="space-y-20">
            {selectedPost.subSections.map((sub, i) => (
              <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} gap-12 items-center`} data-aos={i % 2 === 0 ? "fade-right" : "fade-left"}>
                <div className="flex-1 text-deep-brown">
                  <h4 className="text-3xl font-serif mb-6">{sub.title}</h4>
                  <p className="text-gray-600 font-sans leading-loose whitespace-pre-line">{sub.description}</p>
                </div>
                {sub.image && (
                  <div className="flex-1 w-full h-[400px] rounded-2xl overflow-hidden shadow-xl border-4 border-gold/10">
                    <img src={sub.image} alt={sub.title} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-24 pt-12 border-t border-gold/20 text-center">
            <button onClick={() => setView('HOME')} className="lux-btn-primary flex items-center gap-2 mx-auto"><BookOpen size={18} /> Kembali ke Katalog</button>
          </div>
        </div>
      </div>
    );
  };

  const renderAdminLogin = () => (
    <div className="flex items-center justify-center h-screen bg-cream">
      <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-2xl border border-gold/20" data-aos="zoom-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gold rounded-3xl rotate-45 mx-auto flex items-center justify-center mb-6 shadow-xl shadow-gold/20">
            <LayoutDashboard className="-rotate-45 text-white" size={32} />
          </div>
          <h2 className="text-3xl font-serif text-deep-brown">Gerbang Kurator</h2>
          <p className="text-gray-400 font-sans text-sm mt-2">Akses terbatas untuk pengurus InfoPapeda</p>
        </div>
        <form onSubmit={handleAdminLogin} className="space-y-6">
          <div className="admin-input-group">
            <label>Username</label>
            <input type="text" required value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="admin" />
          </div>
          <div className="admin-input-group">
            <label>PIN Rahasia</label>
            <input type="password" required value={adminPin} onChange={(e) => setAdminPin(e.target.value)} placeholder="••••" maxLength={4} />
          </div>
          <button type="submit" className="w-full lux-btn-primary py-4 mt-4 shadow-lg shadow-gold/30">Masuk Sekarang</button>
        </form>
      </div>
    </div>
  );

  const renderAdminDashboard = () => (
    <div className="p-6 md:p-12 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h2 className="text-4xl font-serif text-deep-brown">{isEditing ? "Edit Warisan Rasa" : "Tambah Warisan Baru"}</h2>
            <p className="text-gray-500 font-sans mt-1">Kelola konten dan dokumentasi papeda secara real-time.</p>
          </div>
          {isEditing ? (
            <button onClick={resetForm} className="lux-btn-secondary py-2">Batal Edit</button>
          ) : (
            showCreateForm && <button onClick={resetForm} className="lux-btn-secondary py-2">Batal</button>
          )}
        </div>

        {showWarningModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl max-w-md w-full shadow-2xl">
              <h3 className="text-2xl font-serif text-deep-brown mb-4">Peringatan</h3>
              <p className="text-gray-600 mb-8 font-sans">
                Apakah kamu akan membuat konten baru? Karena konten yang sudah dibuat tidak bisa dihapus.
              </p>
              <div className="flex justify-end gap-4 font-sans">
                <button className="px-6 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold transition-colors" onClick={() => setShowWarningModal(false)}>
                  Cancel
                </button>
                <button className="px-6 py-2 bg-gold text-white rounded-lg hover:bg-gold/90 font-bold transition-colors" onClick={() => { setShowWarningModal(false); setShowCreateForm(true); }}>
                  Iya
                </button>
              </div>
            </div>
          </div>
        )}

        {!isEditing && !showCreateForm ? (
          <div className="mb-16">
            <button onClick={() => setShowWarningModal(true)} className="lux-btn-primary py-4 px-8 w-full md:w-auto">Ingin buat postingan baru?</button>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-gold/10 mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="space-y-6">
              <div className="admin-input-group">
                <label>Judul Artikel</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} placeholder="Contoh: Keunikan Papeda Bungkus Daun..." />
              </div>
              <div className="admin-input-group">
                <label>Ringkasan Pendek</label>
                <textarea rows={4} value={formData.summary} onChange={(e) => setFormData({...formData, summary: e.target.value})} placeholder="Gambarkan cita rasa papeda dalam beberapa kalimat..." />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Foto Sampul Utama</label>
              <div className="relative h-64 bg-gray-100 rounded-2xl border-2 border-dashed border-gold/30 overflow-hidden flex items-center justify-center group">
                {formData.coverImage ? (
                  <>
                    <img src={formData.coverImage} className="w-full h-full object-cover" alt="Preview" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <label className="cursor-pointer bg-white text-deep-brown p-3 rounded-full"><Camera size={20} /><input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(null, e.target.files[0])} /></label>
                    </div>
                  </>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 text-gold">
                    <Camera size={40} /><span className="font-sans text-xs font-bold uppercase tracking-widest">Klik untuk Upload</span>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(null, e.target.files[0])} />
                  </label>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-serif text-deep-brown">Sub-Bagian Konten</h3>
              <button onClick={addSubSection} className="flex items-center gap-2 text-gold hover:text-gold/80 font-sans font-bold text-xs uppercase tracking-widest"><PlusCircle size={18} /> Tambah Sub-Bagian</button>
            </div>
            {formData.subSections.map((sub, index) => (
              <div key={index} className="admin-sub-section animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-start justify-between mb-4">
                  <h4>Bagian #{index + 1}</h4>
                  <button onClick={() => removeSubSection(index)} className="text-red-500 hover:text-red-700 transition-colors p-2"><Trash2 size={20} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-4">
                    <input type="text" placeholder="Sub-Judul" className="sub-section-input" value={sub.title} onChange={(e) => updateSubSection(index, 'title', e.target.value)} />
                    <textarea rows={6} placeholder="Deskripsi mendalam..." className="sub-section-input" value={sub.description} onChange={(e) => updateSubSection(index, 'description', e.target.value)} />
                  </div>
                  <div>
                    <div className="h-full min-h-[150px] bg-white rounded-xl border border-gray-300 overflow-hidden relative flex items-center justify-center">
                      {sub.image ? (
                        <>
                          <img src={sub.image} className="w-full h-full object-cover" alt="Sub Preview" />
                          <button onClick={() => updateSubSection(index, 'image', '')} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-md"><X size={12} /></button>
                        </>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center gap-2 text-gray-400">
                          <Camera size={24} /><span className="text-[10px] font-bold uppercase">Foto Pendukung</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(index, e.target.files[0])} />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col md:flex-row gap-4">
            <button onClick={handleSavePost} className="flex-1 lux-btn-primary py-4 flex items-center justify-center gap-2 px-8">
              <LayoutDashboard size={20} /> {isEditing ? "Perbarui Postingan" : "Terbitkan Warisan"}
            </button>
          </div>
        </div>
        )}
        <div className="bg-white rounded-3xl p-8 md:p-10 shadow-xl border border-gold/10">
          <h3 className="text-2xl font-serif text-deep-brown mb-8 flex items-center gap-3"><Search className="text-gold" size={24} /> Daftar Postingan Aktif</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                  <th className="pb-4 font-bold">Judul Postingan</th>
                  <th className="pb-4 font-bold">Tanggal</th>
                  <th className="pb-4 font-bold">Penulis</th>
                  <th className="pb-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {posts.map((post) => (
                  <tr key={post.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="py-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg overflow-hidden border border-gold/10"><img src={post.coverImage} className="w-full h-full object-cover" alt="" /></div><span className="font-bold text-deep-brown">{post.title}</span></div></td>
                    <td className="py-6 text-sm text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</td>
                    <td className="py-6"><span className="text-[10px] px-2 py-1 bg-gold/10 text-gold rounded-full font-bold uppercase">{post.author}</span></td>
                    <td className="py-6 text-right"><div className="flex justify-end gap-2"><button onClick={() => startEditing(post)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit size={20} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  // Memungkinkan kita menggunakan import.meta.env.BASE_URL di JSX
  const getImgUrl = (path: string) => {
    // Agar bisa diganti dengan link HTTP eksternal nantinya, kita cek apakah ini link lengkap atau hanya dari /images
    if (path.startsWith('http')) return path;
    return `${import.meta.env.BASE_URL}${path.startsWith('/') ? path.substring(1) : path}`;
  };

  const teamMembers = [
    { 
      name: "Wigati Isma Wibowo", 
      role: "Ketua Kurator", 
      bio: "Saya suka mengekspresikan diri lewat gambar dan seni.",
      placeOfBirth: "Banjarnegara, Jawa Tengah",
      school: "SMA Negeri 1 Purwareja Klampok",
      absen: "34",
      hobby: "Menggambar",
      about: "Saya adalah seseorang yang suka mengekspresikan diri lewat gambar. Bagi saya, menggambar bukan hanya sekadar hobi, tapi juga cara untuk menuangkan imajinasi dan perasaan yang kadang sulit diungkapkan dengan kata-kata. Saya juga tertarik dengan suasana cyberpunk city—kota futuristik dengan lampu neon dan teknologi modern. Suasana seperti itu membuat saya merasa lebih hidup dan berwarna.",
      likes: "Saya sangat menyukai hewan, terutama anjing dan kucing. Untuk anjing, saya paling suka Doberman dan Golden Retriever karena terlihat gacor, setia, dan memiliki karakter yang kuat. Saya juga pecinta makanan seafood, terutama udang dan cumi, karena rasanya yang lezat dan bikin ketagihan. Untuk minuman, saya menyukai rasa yang creamy dan khas seperti matcha, Thai tea, dan teh tarik, yang cocok dinikmati saat santai.",
      ig: "@_.gzheii, @grethd_puff8",
      image: "https://i.ibb.co.com/PsPTVqh6/Whats-App-Image-2026-05-09-at-11-12-00.jpg" // <-- GANTI LINK INI DENGAN LINK FOTO YANG ASLI
    },
    { 
      name: "Chaesar Intan Zabrina", 
      role: "Analis Data Kuliner", 
      bio: "Semangat ke sekolah, karena ilmu adalah kunci kesuksesan.",
      placeOfBirth: "30 Maret 2009",
      school: "SMA N 1 Purwareja Klampok (Kelas 11-E)",
      hobby: "Joging dan masak",
      citaCita: "Pemain bola voli",
      about: "Semangat ke sekolah, karena ilmu adalah kunci kesuksesan. Makanan khas papeda bukan sekadar makanan, tetapi warisan budaya yang diolah dengan penuh kesabaran dan cinta.",
      likes: "Saya suka berolahraga terutama voli dan menjaga kebugaran dengan joging. Selain itu, saya senang bereksperimen di dapur untuk memasak.",
      image: "https://i.ibb.co.com/MyVtwr8h/Whats-App-Image-2026-05-07-at-07-31-17.jpg" // <-- GANTI LINK INI DENGAN LINK FOTO YANG ASLI
    },
    { 
      name: "Resty Fitriani", 
      role: "Editor Visual", 
      bio: "Memasak cara mengekspresikan kreativitas & memberi kebahagiaan.",
      placeOfBirth: "Bekasi, 8 Oktober 2008",
      school: "SMA Negeri 1 Purwareja Klampok (Kelas XI)",
      hobby: "Membaca, memasak, dan mendengarkan musik",
      about: "Perkenalkan, nama saya Resty Fitriani, biasa dipanggil Resty. Saat ini saya tinggal di Banjarnegara. Saya adalah anak pertama dari empat bersaudara. Semangat belajar, karena ilmu adalah kunci menuju masa depan yang cerah.",
      likes: "Memasak bukan hanya sekadar hobi, tetapi juga cara untuk mengekspresikan kreativitas dan memberikan kebahagiaan kepada orang lain. Saya juga sangat menyukai musik dan membaca buku.",
      image: "https://i.ibb.co.com/SXNP7XGT/Whats-App-Image-2026-05-07-at-07-31-17-1.jpg" // <-- GANTI LINK INI DENGAN LINK FOTO YANG ASLI
    },
    { 
      name: "Uswatun Hasanah", 
      role: "Penulis Utama", 
      bio: "Cita-cita ku jadi CEO dan bisa membanggakan orang tua.",
      placeOfBirth: "Banjarnegara",
      hobby: "Menari, makan, membaca, nyanyi, tidur",
      citaCita: "CEO / Masuk FH Undip",
      about: "Kon'nichiwa minasan, Hajimemashite nama aku Uswatun Hasanah dipanggil nengok. Aku lahir di Banjarnegara dibumi dan dari perut ibuku. Kadang pelupa tapi kalau ngelupain jungwon gabisa sih ksksks. Arigato gamsahabnida.",
      likes: "Hobiku sangat beragam: kadang menari, kadang makan, kadang membaca, kadang mendengarkan lagu, kadang nyanyi, dan kadang tidur. Dan pastinya The Boyz / Jungwon!",
      image: "https://i.ibb.co.com/Y71320Hn/Whats-App-Image-2026-05-07-at-07-31-18.jpg" // <-- GANTI LINK INI DENGAN LINK FOTO YANG ASLI
    },
    { 
      name: "Rafalentino", 
      role: "Riset Lapangan", 
      bio: "Kegagalan adalah kunci menuju kesuksesan.",
      placeOfBirth: "4 September 2009",
      school: "SMAN 1 Purwareja Klampok",
      hobby: "Membaca, menulis sastra",
      ig: "@adalah pokonya",
      about: "Halo perkenalkan nama saya adalah Rafalentino, saya adalah pelajar SMAN 1 PURWAREJA klampok. Rafa anaknya adalah pendiam tapi dalam kediaman itu Rafa memiliki mindset untuk berkembang. Rafa menghabiskan masa muda dengan terus belajar walaupun banyak kegagalan tapi Rafa tidak menyerah.",
      likes: "Saya suka dengan dunia sastra. Saya suka mencoba banyak hal baru yang belum pernah saya ketahui karena di situ dapat membuat saya berkembang lebih baik. Saya suka membuat cerpen, puisi sendiri walaupun kurang bagus tapi saya merasa senang.",
      image: "https://i.ibb.co.com/Z1hMB5tj/Whats-App-Image-2026-05-09-at-10-40-42.jpg" // <-- GANTI LINK INI DENGAN LINK FOTO YANG ASLI
    }
  ];

  const renderProfile = () => {
    if (selectedMember) {
      return (
        <div className="p-6 md:p-24 bg-cream min-h-screen">
          <div className="max-w-4xl mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl border border-gold/20" data-aos="fade-in">
            <div className="p-8 md:p-12">
              <button onClick={() => setSelectedMember(null)} className="mb-8 text-gold flex items-center gap-2 hover:underline font-sans text-xs uppercase tracking-widest font-bold"><ArrowLeft size={16} /> Kembali ke Tim</button>
              
              <div className="flex flex-col md:flex-row gap-10">
                <div className="w-full md:w-1/3">
                  <div className="aspect-square bg-gold/10 rounded-2xl overflow-hidden border-4 border-gold/30 mb-6 flex items-center justify-center">
                    {selectedMember.image ? 
                      <img src={selectedMember.image} alt={selectedMember.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" /> :
                      <Users className="text-gold" size={80} />
                    }
                  </div>
                  <h2 className="text-3xl font-serif text-deep-brown mb-2">{selectedMember.name}</h2>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gold opacity-80 block mb-6">{selectedMember.role}</span>
                  
                  {selectedMember.ig && (
                    <div className="mb-4">
                      <span className="text-xs text-gray-400 font-sans uppercase tracking-widest block mb-1">Instagram</span>
                      <p className="text-sm font-sans text-deep-brown">{selectedMember.ig}</p>
                    </div>
                  )}
                </div>
                
                <div className="w-full md:w-2/3 space-y-8">
                  {selectedMember.about ? (
                    <>
                      <div>
                        <h4 className="text-gold font-sans tracking-widest uppercase text-xs font-bold mb-3 border-b border-gold/20 pb-2">Data Diri</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-sans">
                          {selectedMember.placeOfBirth && <div><span className="text-gray-400 block mb-1">Kelahiran</span><span className="text-deep-brown">{selectedMember.placeOfBirth}</span></div>}
                          {selectedMember.hobby && <div><span className="text-gray-400 block mb-1">Hobi</span><span className="text-deep-brown">{selectedMember.hobby}</span></div>}
                          {selectedMember.school && <div><span className="text-gray-400 block mb-1">Sekolah</span><span className="text-deep-brown">{selectedMember.school}</span></div>}
                          {selectedMember.absen && <div><span className="text-gray-400 block mb-1">Nomor Absen</span><span className="text-deep-brown">{selectedMember.absen}</span></div>}
                          {selectedMember.citaCita && <div><span className="text-gray-400 block mb-1">Cita-cita</span><span className="text-deep-brown">{selectedMember.citaCita}</span></div>}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-gold font-sans tracking-widest uppercase text-xs font-bold mb-3 border-b border-gold/20 pb-2">Tentang Saya</h4>
                        <p className="text-gray-600 font-sans leading-relaxed text-sm">{selectedMember.about}</p>
                      </div>
                      
                      <div>
                        <h4 className="text-gold font-sans tracking-widest uppercase text-xs font-bold mb-3 border-b border-gold/20 pb-2">Hal yang Saya Suka</h4>
                        <p className="text-gray-600 font-sans leading-relaxed text-sm">{selectedMember.likes}</p>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-400 font-sans italic text-center">Detail informasi untuk {selectedMember.name} sedang dalam persiapan.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 md:p-24 bg-cream min-h-screen">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20" data-aos="fade-up">
            <h3 className="text-gold font-sans tracking-[0.3em] uppercase text-xs font-bold mb-4">Mengenal Kami</h3>
            <h2 className="text-5xl md:text-7xl font-serif text-deep-brown mb-6">Tim Kurator InfoPapeda</h2>
            <div className="w-24 h-1 bg-gold mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {teamMembers.map((member, i) => (
              <div 
                key={member.name} 
                onClick={() => setSelectedMember(member)}
                className="bg-white p-8 rounded-3xl border border-gold/20 shadow-xl text-center group transition-all hover:-translate-y-2 cursor-pointer" 
                data-aos="fade-up" 
                data-aos-delay={i * 100}
              >
                <div className="w-24 h-24 bg-gold/10 rounded-full mx-auto mb-6 flex items-center justify-center overflow-hidden border-2 border-gold/30">
                  {member.image ? 
                    <img src={member.image} alt={member.name} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> :
                    <Users className="text-gold" size={40} />
                  }
                </div>
                <h3 className="text-2xl font-serif text-deep-brown mb-2">{member.name}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gold opacity-80">{member.role}</span>
                <p className="mt-4 text-sm text-gray-500 font-sans italic line-clamp-2">"{member.bio}"</p>
                <button className="mt-6 text-xs text-gold uppercase tracking-widest font-bold group-hover:text-deep-brown transition-colors">Lihat Profil</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const SagoPopGame = () => {
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [gameActive, setGameActive] = useState(false);
    const [bubbles, setBubbles] = useState<{ id: number, x: number, y: number }[]>([]);
    useEffect(() => {
      let timer: any, bubbleTimer: any;
      if (gameActive && timeLeft > 0) {
        timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        bubbleTimer = setInterval(() => setBubbles(prev => [...prev, { id: Date.now(), x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 }]), 800);
      } else if (timeLeft === 0) { setGameActive(false); confetti(); }
      return () => { clearInterval(timer); clearInterval(bubbleTimer); };
    }, [gameActive, timeLeft]);
    return (
      <div className="p-6 md:p-12 bg-deep-brown min-h-screen flex flex-col items-center justify-center text-cream">
        <div className="flex justify-start w-full mb-8">
           <button onClick={() => setView('HOME')} className="text-gold flex items-center gap-2 hover:underline"><ArrowLeft size={16}/> Kembali</button>
        </div>
        <div className="text-center mb-10"><h2 className="text-4xl md:text-5xl font-serif text-gold mb-2">Sago Pop!</h2><p className="font-sans text-xs uppercase tracking-widest text-gray-400">Ketuk sagu untuk mengolahnya!</p></div>
        <div className="relative w-full max-w-2xl aspect-video bg-black/40 rounded-3xl border-4 border-gold/30 overflow-hidden cursor-crosshair">
          {!gameActive ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">{timeLeft === 0 && <h3 className="text-2xl md:text-3xl font-serif text-gold mb-4">Skor: {score}</h3>}<button onClick={() => { setScore(0); setTimeLeft(30); setGameActive(true); setBubbles([]); }} className="lux-btn-primary">{timeLeft === 0 ? "Main Lagi" : "Mulai Game"}</button></div>
          ) : (
            <>{bubbles.map(b => (
                <button key={b.id} onClick={() => { setBubbles(p => p.filter(x => x.id !== b.id)); setScore(s => s + 1); }} style={{ left: `${b.x}%`, top: `${b.y}%` }} className="absolute w-12 h-12 bg-white/20 border-2 border-gold rounded-full flex items-center justify-center animate-bounce transition-transform active:scale-150"><div className="w-6 h-6 bg-gold rounded-full opacity-50" /></button>
              ))}<div className="absolute top-4 left-4 md:top-6 md:left-6 font-serif text-lg md:text-2xl text-gold">Skor: {score}</div><div className="absolute top-4 right-4 md:top-6 md:right-6 font-serif text-lg md:text-2xl text-gold">Waktu: {timeLeft}s</div></>
          )}
        </div>
      </div>
    );
  };

  const renderSejarah = () => (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="min-h-screen bg-cream text-deep-brown p-6 md:p-16"
    >
      <div className="max-w-4xl mx-auto mt-8">
        <h2 className="text-5xl md:text-6xl font-serif text-deep-brown mb-8 text-center" data-aos="fade-up">Sejarah Papeda</h2>
        <div className="w-24 h-1 bg-gold mx-auto mb-12" data-aos="fade-up" data-aos-delay="100"></div>
        
        <div className="space-y-8 font-sans text-lg leading-relaxed text-gray-700" data-aos="fade-up" data-aos-delay="200">
          <p>
            Papeda bukan sekadar makanan, melainkan saksi bisu perjalanan panjang peradaban masyarakat di Indonesia Timur, khususnya Papua dan Maluku. Sejarah mencatat bahwa sagu—bahan baku utama papeda—telah menjadi sumber kehidupan selama berabad-abad sebelum beras dikenal luas di Nusantara.
          </p>
          <div className="my-10 border-l-4 border-gold pl-6 italic text-xl text-deep-brown font-serif bg-white/40 p-6 rounded-r-xl shadow-sm">
            "Sagu adalah anugerah alam yang membentuk pilar ketahanan pangan dan merangkai struktur sosial masyarakat pesisir."
          </div>
          <p>
            Sejak zaman prasejarah, penduduk asli wilayah timur telah menguasai teknik ekstraksi pati dari batang pohon sagu (<i>Metroxylon sagu</i>). Pengetahuan ini diwariskan secara turun-temurun melalui tradisi lisan dan ritual adat. Pembuatan papeda melibatkan proses mengaduk tepung sagu dengan air mendidih hingga mencapai tekstur kental seperti lem, sebuah manifestasi dari kecerdasan lokal dalam mengolah sumber daya alam yang melimpah menjadi sumber karbohidrat utama.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-10">
            <img src="https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&q=80" alt="Bahan Tradisional" className="w-full h-80 object-cover rounded-2xl shadow-xl mix-blend-multiply border border-gold/20" />
            <div className="flex flex-col justify-center">
              <h3 className="text-3xl font-serif text-gold mb-6">Relasi dengan Alam</h3>
              <p className="text-base text-gray-700 leading-relaxed">Masyarakat Papua memiliki ikatan spiritual yang mendalam dengan hutan sagu. Mereka memanen sagu secukupnya sesuai kebutuhan dan membiarkannya beregenerasi, mencerminkan kearifan ekologis tingkat tinggi yang menjaga kelestarian ekosistem rawa-rawa hutan jauh sebelum rentetan konsep keberlanjutan modern digaungkan di seluruh dunia.</p>
            </div>
          </div>
          <p>
            Seiring berjalannya waktu, papeda tetap mempertahankan keasliannya dan tak tergerus oleh laju modernisasi. Ia selalu disajikan dengan kuah kuning yang kaya akan rempah—kunyit, serai, daun jeruk, dan kemangi—berpadu sempurna dengan hasil tangkapan laut segar. Harmoni rasa ini menjadikannya bukan sekadar santapan, namun identitas tak terpisahkan dari bumi Nusantara bagian timur.
          </p>
        </div>
      </div>
    </motion.div>
  );

  const renderFilosofi = () => (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="min-h-screen bg-deep-brown text-cream p-6 md:p-16 relative overflow-hidden"
    >
      {/* Abstract Background Element */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gold/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="max-w-4xl mx-auto mt-8 relative z-10">
        <h2 className="text-5xl md:text-6xl font-serif text-gold mb-8 text-center" data-aos="fade-up">Filosofi Rasa</h2>
        <div className="w-24 h-1 bg-white/20 mx-auto mb-16" data-aos="fade-up" data-aos-delay="100"></div>
        
        <div className="space-y-8" data-aos="fade-up" data-aos-delay="200">
          <div className="bg-white/5 border border-white/10 p-10 rounded-2xl hover:border-gold/30 hover:bg-white/10 transition-all duration-500 transform hover:-translate-y-1 shadow-xl">
            <h3 className="text-3xl font-serif text-gold mb-6 flex items-center gap-4"><Users className="w-8 h-8 text-white/50" /> Kolektivitas dan Persaudaraan</h3>
            <p className="font-sans text-lg leading-relaxed text-cream/80">
              Menikmati papeda memiliki tata cara yang unik. Sering kali, papeda disajikan dalam satu piring besar atau wadah kayu tradisional yang disebut <i>hote</i> untuk disantap bersama oleh seluruh anggota keluarga. Tradisi ini menumbuhkan rasa persaudaraan, kesetaraan, dan rasa sepenanggungan. Makan papeda dari satu wadah yang sama melambangkan hilangnya batas-batas pembatas relasi egoisme dan menegaskan kembali bahwa mereka semua berasal dari satu akar tradisi.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-10 rounded-2xl hover:border-gold/30 hover:bg-white/10 transition-all duration-500 transform hover:-translate-y-1 shadow-xl">
            <h3 className="text-3xl font-serif text-gold mb-6 flex items-center gap-4"><Heart className="w-8 h-8 text-white/50" /> Sikap Sabar dan Kebijaksanaan</h3>
            <p className="font-sans text-lg leading-relaxed text-cream/80">
              Tekstur papeda yang amat lengket dan tebal mengajarkan makna kesabaran. Menikmati papeda tidak bisa dilakukan dengan tergesa-gesa; ia membutuhkan teknik tersendiri, dengan cara menggulungnya secara teratur menggunakan sepasang sumpit bambu yang disebut <i>gata-gata</i>. Hal ini adalah bentuk manifestasi dari kehati-hatian, perhitungan yang matang, serta kelembutan dalam menjalani dinamika kehidupan.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-10 rounded-2xl hover:border-gold/30 hover:bg-white/10 transition-all duration-500 transform hover:-translate-y-1 shadow-xl">
            <h3 className="text-3xl font-serif text-gold mb-6 flex items-center gap-4"><BookOpen className="w-8 h-8 text-white/50" /> Keseimbangan Spektrum Hidup</h3>
            <p className="font-sans text-lg leading-relaxed text-cream/80">
              Dalam sajian komplitnya, papeda yang sengaja berasa tawar (sebagai perlambang murninya kejujuran dan netralitas) selalu dipertemukan dengan Ikan Kuah Kuning yang pekat kaya rasa dan pedas (perlambang dinamika dan kerasnya ujian). Gabungan kontradiktif ini justru menghasilkan paduan rasa yang sempurna. Filosofi ini mengajarkan bahwa tantangan, gejolak, dan rasa syukur memberi esensi luhur dan sangat memperkaya tatanan hidup yang sederhana tersebut.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderComingSoon = (title: string) => (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 bg-cream text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#c5a059 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto relative z-10"
      >
        <BookOpen className="w-16 h-16 text-gold mx-auto mb-6 opacity-80" />
        <h2 className="text-4xl md:text-5xl font-serif text-deep-brown mb-4">{title}</h2>
        <p className="text-gray-500 font-sans tracking-widest text-sm uppercase mb-8">Halaman ini sedang dalam tahap penyusunan oleh Tim Kurator</p>
        <button onClick={() => setView('HOME')} className="px-6 py-3 border border-gold/50 text-gold hover:bg-gold hover:text-white transition-colors rounded-full font-sans uppercase tracking-widest text-xs font-bold w-fit mx-auto">
          Kembali ke Beranda
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col selection:bg-gold/30 selection:text-deep-brown">
      {renderNavbar()}
      {renderRightSidebar()}
      <main className="flex-1 flex flex-col pt-20 overflow-x-hidden">
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {view === 'HOME' && renderHome()}
            {view === 'DETAIL' && renderDetail()}
            {view === 'ADMIN_LOGIN' && renderAdminLogin()}
            {view === 'ADMIN_DASHBOARD' && renderAdminDashboard()}
            {view === 'PROFILE' && renderProfile()}
            {view === 'GAME' && <SagoPopGame />}
            {view === 'DEVELOPER_INFO' && renderDeveloperInfo()}
            {view === 'ABOUT' && renderAbout()}
            {view === 'CONTACT' && renderContact()}
            {view === 'SEJARAH' && renderSejarah()}
            {view === 'FILOSOFI' && renderFilosofi()}
          </AnimatePresence>
        </div>
        {view !== 'GAME' && renderFooter()}
      </main>
      <div className="toast-container">{toasts.map(toast => (<Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} />))}</div>
    </div>
  );
}
