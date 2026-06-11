// URL del sitio — reemplazar con el dominio real cuando esté publicado
const SITE_URL = 'https://picnicboxpe-source.github.io/the_lemon_club';

// ═══════════════════════════════════════════════
// FIREBASE SETUP
// ═══════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, addDoc, getDocs, query, where, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyC91I0sFzvWYx47YfU0bC5S3rgrZ4Ypa3Y",
  authDomain: "thelemonclub.firebaseapp.com",
  projectId: "thelemonclub",
  storageBucket: "thelemonclub.firebasestorage.app",
  messagingSenderId: "832867282040",
  appId: "1:832867282040:web:bedd54ec8f8f39a2c0518d"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ─── Refs ───
const settingsRef = doc(db, 'store', 'settings');
const categoriesRef = doc(db, 'store', 'categories');
const productsCol = collection(db, 'products');
const textBlocksCol = collection(db, 'textBlocks');
const waitlistCol = collection(db, 'waitlist');

// ─── IndexedDB image cache (no size limit, replaces base64 in localStorage) ───
const IDB = (() => {
  let _db = null;
  const open = () => _db ? Promise.resolve(_db) : new Promise((res, rej) => {
    const r = indexedDB.open('tlc-imgs', 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('imgs');
    r.onsuccess = e => { _db = e.target.result; res(_db); };
    r.onerror = rej;
  });
  return {
    save(products) {
      open().then(db => {
        const tx = db.transaction('imgs', 'readwrite'), st = tx.objectStore('imgs');
        products.forEach(p => (p.imgs||[]).forEach((img, i) => { if (img) st.put(img, p.id+'_'+i); }));
      }).catch(() => {});
    },
    async restore(products) {
      try {
        const db = await open();
        return Promise.all(products.map(p =>
          Promise.all((p.imgs||[]).map((img, i) => img ? Promise.resolve(img) : new Promise(res => {
            const r = db.transaction('imgs').objectStore('imgs').get(p.id+'_'+i);
            r.onsuccess = () => res(r.result || '');
            r.onerror = () => res('');
          }))).then(imgs => { while (imgs.length && !imgs[imgs.length-1]) imgs.pop(); return {...p, imgs}; })
        ));
      } catch { return products; }
    }
  };
})();

// ─── In-memory store ───
let store = {
  settings: {
    font: 'Barlow', brand: 'The Lemon Club', navBrand: '', logo: '', brandImg: '',
    heroSub: 'Accesorios con personalidad. Únicos, modernos y para ti.',
    wa: '51987654321',
    band: 'HECHO CON AMOR — ACCESORIOS ÚNICOS — ESCRÍBENOS POR WHATSAPP',
    footer: 'Accesorios únicos en Caracas • Contáctanos por WhatsApp',
    password: 'admin123',
    colors: { black:'#0A0A0A', yellow:'#F5E642', green:'#1DB954', white:'#FAFAFA', hero:'#F5E642', band:'#0A0A0A', bandText:'#F5E642', gray:'#E8E8E8' }
  },
  categories: ['Todos','Collares','Ganchos','Correas'],
  products: [],
  textBlocks: []
};

// ─── Apply cached settings instantly to avoid flash ───
try {
  const cached = localStorage.getItem('tlc_settings');
  if (cached) {
    const s = JSON.parse(cached);
    store.settings = { ...store.settings, ...s };
    const c = s.colors || {};
    const r = document.documentElement.style;
    if (c.black) r.setProperty('--black', c.black);
    if (c.yellow) r.setProperty('--yellow', c.yellow);
    if (c.green)  r.setProperty('--green', c.green);
    if (c.white)  r.setProperty('--white', c.white);
    if (c.gray)   r.setProperty('--gray', c.gray);
    if (s.font) document.body.style.fontFamily = `'${s.font}', sans-serif`;
    // Preload hero image from cache to avoid slow reveal
    if (s.brandImg) {
      const heroImg = document.getElementById('hero-brand-img');
      const heroWrap = document.getElementById('hero-img-wrap');
      const heroTxt = document.getElementById('brand-hero');
      if (heroImg && heroWrap) {
        heroImg.src = s.brandImg;
        heroWrap.style.display = 'block';
        if (heroTxt) heroTxt.style.display = 'none';
      }
    } else {
      const heroTxt = document.getElementById('brand-hero');
      if (heroTxt) heroTxt.textContent = s.brand || '';
    }
    const hs = document.getElementById('hero-sub');
    if (hs && s.heroSub) hs.textContent = s.heroSub;
    // Reveal hero immediately since we have cached data
    const bhw = document.getElementById('brand-hero-wrap');
    if (bhw) bhw.style.visibility = 'visible';
    if (hs) hs.style.visibility = 'visible';
    const navTxt = document.getElementById('nav-brand-text');
    if (navTxt) { navTxt.textContent = s.navBrand !== undefined ? s.navBrand : ''; navTxt.style.visibility = 'visible'; }
  }
  const cachedCats = localStorage.getItem('tlc_categories');
  if (cachedCats) store.categories = JSON.parse(cachedCats);
  const cachedProds = localStorage.getItem('tlc_products');
  if (cachedProds) {
    store.products = JSON.parse(cachedProds);
    IDB.restore(store.products).then(restored => { store.products = restored; renderProducts(); }).catch(() => {});
  }
  const cachedBlocks = localStorage.getItem('tlc_textblocks');
  if (cachedBlocks) store.textBlocks = JSON.parse(cachedBlocks);
} catch(e) {}

// ─── Pre-render from cache during the loading animation ───
// Products are ready by the time the animation finishes
requestAnimationFrame(() => {
  try {
    renderCategoryTabs();
    renderProducts();
    renderTextBlocks();
    renderHome();
  } catch(e) {}
});

let editingProductId = null;
let editingTextBlockId = null;
let isAdmin = false;
let activeCategory = 'Todos';

// ─── Loading screen ───
let loaded = false;
function hideLoading() {
  if (loaded) return; loaded = true;
  const el = document.getElementById('loading-screen');
  function revealApp() {
    document.getElementById('main-nav').style.display = 'flex';
    if (!isAdmin) { document.getElementById('home-page').style.display = 'block'; }
  }
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => { if (el.parentNode) el.remove(); revealApp(); window.dispatchEvent(new Event('appReady')); }, 400);
  } else {
    revealApp();
    window.dispatchEvent(new Event('appReady'));
  }
}
// Con caché: revelar en 500ms (productos ya renderizados, imágenes cargan en fondo)
// Sin caché: onSnapshot dispara hideLoading cuando llegan datos de Firebase
if (store.products.length) {
  setTimeout(hideLoading, 500);
} else {
  setTimeout(hideLoading, 6000); // fallback si Firebase no responde
}

// ─── Firebase write helpers ───
async function saveSettingsToFB(data) { await setDoc(settingsRef, data); }
async function saveCategoriesToFB(cats) { await setDoc(categoriesRef, { list: cats }); }
async function saveProductToFB(prod) { await setDoc(doc(db, 'products', String(prod.id)), prod); }
async function deleteProductFromFB(id) { await deleteDoc(doc(db, 'products', String(id))); }
async function saveTextBlockToFB(tb) { await setDoc(doc(db, 'textBlocks', String(tb.id)), tb); }
async function deleteTextBlockFromFB(id) { await deleteDoc(doc(db, 'textBlocks', String(id))); }

// Darken/lighten a hex color by amount (-255 to 255)
function adjustShade(hex, amount) {
  try {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, Math.max(0, (n>>16) + amount));
    const g = Math.min(255, Math.max(0, ((n>>8)&0xff) + amount));
    const b = Math.min(255, Math.max(0, (n&0xff) + amount));
    return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
  } catch(e) { return hex; }
}

// ─── Bootstrap: real-time listeners ───
function bootstrap() {
  onSnapshot(settingsRef, snap => {
    if (snap.exists()) {
      store.settings = { ...store.settings, ...snap.data() };
      try { localStorage.setItem('tlc_settings', JSON.stringify(store.settings)); } catch(e) {}
      // Update loading screen colors live if still showing
      const li = document.getElementById('loading-inner');
      if (li) {
        const c = store.settings.colors || {};
        const bg = c.green ? adjustShade(c.green, -60) : '#BAC63D';
        const txt = c.green ? adjustShade(c.green, 80) : '#e8eda0';
        const sub = c.green ? adjustShade(c.green, 30) : '#b8c45a';
        li.style.background = bg;
        li.querySelectorAll('[data-ldot]').forEach(d => d.style.background = dot);
        li.querySelector('[data-ltxt]') && (li.querySelector('[data-ltxt]').style.color = txt);
        li.querySelector('[data-lsub]') && (li.querySelector('[data-lsub]').style.color = sub);
      }
    }
    if (loaded) renderHome();
  });
  onSnapshot(categoriesRef, snap => {
    store.categories = snap.exists() ? (snap.data().list || ['Todos']) : ['Todos'];
    try { localStorage.setItem('tlc_categories', JSON.stringify(store.categories)); } catch(e) {}
    if (!store.categories.includes('Todos')) store.categories.unshift('Todos');
    renderCategoryTabs();
    if (isAdmin) renderAdminCategories();
  }, err => { console.error('Error listener categorías:', err); });
  let prodsLoaded = false;
  onSnapshot(productsCol, snap => {
    const incoming = snap.docs.map(d => d.data());
    // Guard: don't replace a full product list with a suspiciously small one from cache.
    // Firestore fires optimistic local-cache snapshots before server confirmation;
    // if the cache is corrupt those snapshots may be incomplete.
    if (incoming.length === 0 && store.products.length > 0) {
      console.warn('Snapshot de productos vacío ignorado (posible caché incompleta)');
    } else {
      store.products = incoming;
      store.products.sort((a,b) => parseFloat(a.price||0) - parseFloat(b.price||0));
      IDB.save(store.products);
      try {
        const cacheable = store.products.map(p => ({
          ...p, imgs: (p.imgs||[]).map(img => img && img.startsWith('data:') ? '' : img)
        }));
        localStorage.setItem('tlc_products', JSON.stringify(cacheable));
      } catch(e) {}
      renderProducts();
      if (isAdmin) renderAdminProducts();
    }
    if (!prodsLoaded) {
      prodsLoaded = true;
      renderHome();
      const grid = document.getElementById('products-grid');
      const imgs = grid ? Array.from(grid.querySelectorAll('img')) : [];
      const pending = imgs.filter(i => !i.complete);
      if (!pending.length) { hideLoading(); return; }
      let remaining = pending.length;
      const tid = setTimeout(hideLoading, 5000);
      const done = () => { if (!--remaining) { clearTimeout(tid); hideLoading(); } };
      pending.forEach(img => { img.onload = img.onerror = done; });
    }
  }, err => { console.error('Error listener productos:', err); showToast('Error de conexión con Firebase. Intenta recargar.'); });
  onSnapshot(textBlocksCol, snap => {
    store.textBlocks = snap.docs.map(d => d.data());
    store.textBlocks.sort((a,b) => (a.id||0) - (b.id||0));
    try { localStorage.setItem('tlc_textblocks', JSON.stringify(store.textBlocks)); } catch(e) {}
    renderTextBlocks();
    if (isAdmin) renderAdminTextBlocks();
  }, err => { console.error('Error listener bloques:', err); });
}
bootstrap();

// ═══════════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════════
function openWA(msg) {
  const num = store.settings.wa;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
}
window.openWA = openWA;

// ═══════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════
function toggleNav() { document.getElementById('nav-links').classList.toggle('open'); }
function closeNav() { document.getElementById('nav-links').classList.remove('open'); }
function scrollToProducts() {
  showHome();
  setTimeout(() => document.getElementById('productos-section').scrollIntoView({ behavior: 'smooth' }), 80);
}
window.toggleNav = toggleNav; window.closeNav = closeNav; window.scrollToProducts = scrollToProducts;

// ═══════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════
let _savedScrollY = 0;
function showHome() {
  document.getElementById('home-page').style.display = 'block';
  document.getElementById('detail-page').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('main-nav').style.display = 'flex';
  requestAnimationFrame(() => window.scrollTo(0, _savedScrollY));
}
function showDetail(id) {
  const p = store.products.find(x => x.id == id);
  if (!p) return;
  _savedScrollY = window.scrollY;
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('detail-page').style.display = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  window.scrollTo(0,0);
  updateSEO({
    title: p.name,
    desc: p.desc ? `${p.desc} — ${store.settings.brand || 'The Lemon Club'}` : `${p.name} en ${store.settings.brand || 'The Lemon Club'}. Accesorios únicos en Caracas.`,
    image: p.imgs && p.imgs[0],
    url: `#producto-${p.id}`,
    type: 'product',
    ldProduct: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: p.desc || p.name,
      image: p.imgs || [],
      brand: { '@type': 'Brand', name: store.settings.brand || 'The Lemon Club' },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: parseFloat(p.price || 0).toFixed(2),
        availability: p.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: store.settings.brand || 'The Lemon Club' }
      }
    }
  });
  currentDetailId = p.id; detailQty = 1;
  const _dqn = document.getElementById('detail-qty-num'); if(_dqn) _dqn.textContent = '1';
  const _dadd = document.getElementById('detail-add-cart-btn'); if(_dadd){ _dadd.textContent='+ Agregar al carrito'; _dadd.classList.remove('added'); }
  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-price').innerHTML = formatPriceDisplay(p);
  document.getElementById('detail-desc').textContent = p.desc;
  const tagEl = document.getElementById('detail-tag');
  // Show product tag OR stock warning (low stock), not both
  if (p.stock === 'unique' && !p.soldOut) {
    tagEl.textContent = '🔴 Pieza única';
    tagEl.className = 'detail-tag tag-unique';
    tagEl.style.display = 'inline-block';
  } else if (p.stock === 'last' && !p.soldOut) {
    tagEl.textContent = '🟠 Última Pieza';
    tagEl.className = 'detail-tag tag-last';
    tagEl.style.display = 'inline-block';
  } else if (p.stock === 'collection' && !p.soldOut) {
    tagEl.textContent = '✨ Única Colección';
    tagEl.className = 'detail-tag tag-collection';
    tagEl.style.display = 'inline-block';
  } else if (p.stock === 'low' && !p.soldOut) {
    tagEl.textContent = 'Pocas unidades';
    tagEl.className = 'detail-tag tag-low';
    tagEl.style.display = 'inline-block';
  } else if (p.tag) { tagEl.textContent = p.tag.charAt(0).toUpperCase()+p.tag.slice(1); tagEl.className='detail-tag tag-'+p.tag; tagEl.style.display='inline-block'; }
  else { tagEl.style.display='none'; }
  const imgs = (p.imgs||[]).filter(Boolean);
  const mainImg = document.getElementById('detail-main-img');
  mainImg.src = imgs[0]||''; mainImg.alt = p.name;
  const thumbsEl = document.getElementById('detail-thumbs');
  thumbsEl.innerHTML = '';
  imgs.forEach((src,i) => {
    const t = document.createElement('div');
    t.className = 'detail-thumb'+(i===0?' active':'');
    t.innerHTML = `<img src="${src}" alt="${p.name}" loading="lazy">`;
    t.onclick = () => { mainImg.src=src; document.querySelectorAll('.detail-thumb').forEach(x=>x.classList.remove('active')); t.classList.add('active'); };
    thumbsEl.appendChild(t);
  });
  const _qtyW = document.getElementById('detail-qty-wrap');
  const _addB = document.getElementById('detail-add-cart-btn');
  const waBtn = document.getElementById('detail-wa-btn');
  if (p.soldOut) {
    waBtn.style.display='none';
    if(_qtyW) _qtyW.style.display='none';
    if(_addB) _addB.style.display='none';
    let so = document.getElementById('detail-soldout-msg');
    if (!so) { so=document.createElement('div'); so.id='detail-soldout-msg'; so.className='detail-soldout'; waBtn.parentNode.insertBefore(so,waBtn); }
    so.style.display='block'; so.textContent='⚠ Este producto está agotado';
  } else {
    waBtn.style.display='flex';
    if(_qtyW) _qtyW.style.display='flex';
    if(_addB) _addB.style.display='block';
    const so=document.getElementById('detail-soldout-msg'); if(so) so.style.display='none';
    waBtn.onclick = () => openWA(`Hola, quiero información sobre: ${p.name}`);
  }
}
function showAdmin() {
  document.getElementById('home-page').style.display='none';
  document.getElementById('detail-page').style.display='none';
  document.getElementById('admin-panel').style.display='block';
  document.getElementById('main-nav').style.display='none';
  window.scrollTo(0,0);
  renderAdmin();
}
window.showHome=showHome; window.showDetail=showDetail; window.showAdmin=showAdmin;

// ═══════════════════════════════════════════════
// MARQUEE
// ═══════════════════════════════════════════════
function buildMarquees() {
  const brand = store.settings.brand;
  const items = Array(20).fill(brand).map(b=>`<span class="marquee-item">${b}</span>`).join('');
  ['mq2'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=items+items; });
}

// ═══════════════════════════════════════════════
// IMAGE UPLOAD
// ═══════════════════════════════════════════════
// crop=false: contain (escala sin recortar) | crop=true: cover + center crop al tamaño exacto
function compressImage(file, maxW, maxH, quality, callback, crop = false) {
  const reader = new FileReader();
  reader.onerror = () => callback(null);
  reader.onload = e => {
    const img = new Image();
    img.onerror = () => callback(null);
    img.onload = () => {
      const sw = img.width, sh = img.height;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (crop) {
        if (sw <= maxW && sh <= maxH) {
          // Ya está en el tamaño correcto, no escalar ni recortar
          canvas.width = sw; canvas.height = sh;
          ctx.drawImage(img, 0, 0, sw, sh);
        } else {
          // Cover + center crop: escalar para cubrir exactamente maxW×maxH
          const scale = Math.max(maxW / sw, maxH / sh);
          const srcW = Math.round(maxW / scale);
          const srcH = Math.round(maxH / scale);
          const srcX = Math.round((sw - srcW) / 2);
          const srcY = Math.round((sh - srcH) / 2);
          canvas.width = maxW; canvas.height = maxH;
          ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, maxW, maxH);
        }
      } else {
        // Contain: escalar para que quepa dentro del área
        let w = sw, h = sh;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
      }
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function uploadToStorage(b64, path) {
  const res = await fetch(b64);
  const blob = await res.blob();
  const imgRef = storageRef(storage, path);
  await uploadBytes(imgRef, blob, { contentType: 'image/jpeg' });
  return await getDownloadURL(imgRef);
}

function handleImgUpload(input, hiddenId, previewId, delBtnId) {
  const file = input.files[0]; if (!file) return;
  const prev = document.getElementById(previewId);
  prev.style.display='block'; prev.style.opacity='.4';
  const isHero = hiddenId === 'set-brandimg';
  const maxW = isHero ? 1920 : 400, maxH = isHero ? 1080 : 200;
  compressImage(file, maxW, maxH, 0.82, async b64 => {
    if (!b64) { prev.style.opacity='1'; return; }
    prev.src = b64;
    prev.style.display='block'; prev.style.opacity='1';
    document.getElementById(hiddenId).value = b64;
    if (delBtnId) document.getElementById(delBtnId).style.display='inline-block';
    try {
      const url = await uploadToStorage(b64, `settings/${hiddenId}_${Date.now()}.jpg`);
      document.getElementById(hiddenId).value = url;
      prev.src = url;
    } catch(e) {}
  });
}
function clearImg(hiddenId, previewId, fileInputId, delBtnId) {
  document.getElementById(hiddenId).value='';
  const prev=document.getElementById(previewId); prev.src=''; prev.style.display='none';
  document.getElementById(fileInputId).value='';
  if (delBtnId) document.getElementById(delBtnId).style.display='none';
  const key = hiddenId==='set-logo'?'logo':'brandImg';
  store.settings[key]='';
  saveSettingsToFB(store.settings);
  renderHome();
}
window.handleImgUpload=handleImgUpload; window.clearImg=clearImg;

// ═══════════════════════════════════════════════
// FONT + COLORS
// ═══════════════════════════════════════════════
function previewFont(font) {
  if (!font) return;
  const slug = font.replace(/ /g, '+') + ':wght@400;700';
  let link = document.getElementById('preview-font-link');
  if (!link) { link = document.createElement('link'); link.id = 'preview-font-link'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?family=${slug}&display=swap`;
  const box = document.getElementById('font-preview');
  if (!box) return;
  box.style.display = 'block';
  box.style.fontFamily = `'${font}', sans-serif`;
}
window.previewFont = previewFont;

function applyFont() {
  const font = store.settings.font||'Barlow';
  const slug = font.replace(/ /g,'+')+':wght@400;600;700;900';
  let link = document.getElementById('dynamic-font-link');
  if (!link) { link=document.createElement('link'); link.id='dynamic-font-link'; link.rel='stylesheet'; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?family=${slug}&display=swap`;
  document.body.style.fontFamily = `'${font}', sans-serif`;
}
function showToast(msg) {
  const t = document.getElementById('toast-msg');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}

function applyColors() {
  const c = store.settings.colors||{};
  const r = document.documentElement.style;
  if(c.black) r.setProperty('--black',c.black);
  if(c.yellow) r.setProperty('--yellow',c.yellow);
  if(c.green) r.setProperty('--green',c.green);
  if(c.white) r.setProperty('--white',c.white);
  if(c.gray) r.setProperty('--gray',c.gray);
  const tcMeta = document.getElementById('theme-color-meta');
  if(tcMeta && c.black) tcMeta.content = c.black;
  const hero=document.querySelector('.hero'); if(hero&&c.hero) hero.style.background=c.hero;
  const band=document.querySelector('.band'); if(band&&c.band) band.style.background=c.band;
  const bandP=document.querySelector('.band p'); if(bandP&&c.bandText) bandP.style.color=c.bandText;
}

// ═══════════════════════════════════════════════
// SEO
// ═══════════════════════════════════════════════
function updateSEO({ title, desc, image, url, type = 'website', ldProduct = null } = {}) {
  const brand    = store.settings.brand || 'The Lemon Club';
  const fullTitle = title ? `${title} — ${brand}` : `${brand} — Catálogo`;
  const finalDesc = desc  || 'Accesorios únicos en Caracas, Venezuela. Collares, ganchos, correas y más, hechos con amor. Escríbenos por WhatsApp.';
  const finalUrl  = `${SITE_URL}/${url || ''}`;
  const finalImg  = image && image.startsWith('http') ? image : `${SITE_URL}/icon-512.png`;

  document.title = fullTitle;

  const set = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  set('meta-desc', 'content', finalDesc);
  set('canonical',  'href',   finalUrl);
  set('og-type',   'content', type);
  set('og-title',  'content', fullTitle);
  set('og-desc',   'content', finalDesc);
  set('og-url',    'content', finalUrl);
  set('og-image',  'content', finalImg);
  set('tw-title',  'content', fullTitle);
  set('tw-desc',   'content', finalDesc);
  set('tw-image',  'content', finalImg);

  let ldScript = document.getElementById('ld-product');
  if (ldProduct) {
    if (!ldScript) {
      ldScript = document.createElement('script');
      ldScript.id = 'ld-product';
      ldScript.type = 'application/ld+json';
      document.head.appendChild(ldScript);
    }
    ldScript.textContent = JSON.stringify(ldProduct, null, 2);
  } else if (ldScript) {
    ldScript.remove();
  }
}

// ═══════════════════════════════════════════════
// RENDER HOME
// ═══════════════════════════════════════════════
function renderHome() {
  const s = store.settings;
  document.title = s.brand+' — Catálogo';
  updateSEO({});
  applyColors(); applyFont();
  if(navTxt) { navTxt.textContent = (s.navBrand !== undefined ? s.navBrand : ''); navTxt.style.visibility = 'visible'; }
  const heroWrap=document.getElementById('hero-img-wrap'),heroTxt=document.getElementById('brand-hero'),heroImg=document.getElementById('hero-brand-img');
  if(s.brandImg){heroImg.src=s.brandImg;heroWrap.style.display='block';heroTxt.style.display='none';}
  else{heroWrap.style.display='none';heroTxt.style.display='block';heroTxt.textContent=s.brand;}
  const hs=document.getElementById('hero-sub'); if(hs) { hs.textContent=s.heroSub; hs.style.visibility='visible'; }
  const bhw=document.getElementById('brand-hero-wrap'); if(bhw) bhw.style.visibility='visible';
  const bt=document.getElementById('band-text'); if(bt) bt.textContent=s.band;
  const ft=document.getElementById('footer-text'); if(ft) ft.textContent=s.footer;
  const fb=document.getElementById('footer-brand'); if(fb) fb.textContent=s.brand;
  buildMarquees(); renderCategoryTabs(); renderProducts(); renderTextBlocks();
}

function renderCategoryTabs() {
  const el=document.getElementById('cat-tabs'); if(!el) return;
  const cats=store.categories||['Todos'];
  const all=cats.includes('Todos')?cats:['Todos',...cats];
  el.innerHTML=all.map(c=>`<button class="cat-tab${c===activeCategory?' active':''}" onclick="filterCategory('${c.replace(/'/g,"\\'")}')"> ${c} </button>`).join('');
}
function filterCategory(cat) { activeCategory=cat; renderCategoryTabs(); renderProducts(); }
window.filterCategory=filterCategory;

function formatPriceDisplay(p) {
  const txt = (p.priceText || '').trim();
  // Detect bundle: "2x5", "2 x 5", "2X5"
  const bundle = txt.match(/^(\d+)\s*[xX×]\s*(\d+[\d.]*)$/);
  if (bundle) {
    return `<span style="font-size:.82rem;color:#777;font-weight:600;">${bundle[1]} und ×</span> <span class="currency">$</span>${parseFloat(bundle[2]).toFixed(2)}`;
  }
  // "Desde 8" or plain number
  const desde = txt.match(/^[Dd]esde\s+(\d+[\d.]*)/);
  if (desde) {
    return `<span style="font-size:.82rem;color:#777;font-weight:600;">Desde</span> <span class="currency">$</span>${parseFloat(desde[1]).toFixed(2)}`;
  }
  return `<span class="currency">$</span>${txt || parseFloat(p.price||0).toFixed(2)}`;
}

function renderProducts() {
  const grid=document.getElementById('products-grid'), count=document.getElementById('product-count');
  if(!grid) return;
  const filtered=(activeCategory==='Todos'?store.products:store.products.filter(p=>p.category===activeCategory))
    .slice().sort((a,b)=>parseFloat(a.price||0)-parseFloat(b.price||0));
  count.textContent=filtered.length+' artículos';
  if(filtered.length===0){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#999;font-size:.95rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Sin productos en esta categoría</div>';return;}

  function buildCard(p) {
    const img=p.imgs&&p.imgs[0]?`<img src="${p.imgs[0]}" alt="${p.name}">`:`<div class="img-placeholder">📷</div>`;
    const tag=p.tag?`<span class="product-tag tag-${p.tag}">${p.tag.charAt(0).toUpperCase()+p.tag.slice(1)}</span>`:'';
    const stockTag = p.stock==='low'
      ? `<span class="product-tag tag-low" style="position:absolute;bottom:10px;left:10px;top:auto;">Pocas unidades</span>`
      : p.stock==='last'
        ? `<span class="product-tag tag-last" style="position:absolute;bottom:10px;left:10px;top:auto;">🟠 Última Pieza</span>`
        : p.stock==='unique'
          ? `<span class="product-tag tag-unique" style="position:absolute;bottom:10px;left:10px;top:auto;">🔴 Pieza única</span>`
          : p.stock==='collection'
            ? `<span class="product-tag tag-collection" style="position:absolute;bottom:10px;left:10px;top:auto;">✨ Única Colección</span>`
            : '';
    const soldOverlay=p.soldOut?`<div class="soldout-overlay"><span class="soldout-label">AGOTADO</span></div>`:'';
    const waBtn=p.soldOut
      ? ``
      : `<a class="wa-btn-mini" onclick="event.stopPropagation();openWA('Hola, quiero información sobre: ${p.name.replace(/'/g,"\\'")}')" >💬 Consultar</a><button class="add-cart-btn" onclick="event.stopPropagation();addToCart(${p.id},1)">+ Agregar al carrito</button>`;
    const wlBtn=p.soldOut
      ? `<button class="wl-overlay-btn" onclick="event.stopPropagation();openWaitlistModal('${p.id}','${p.name.replace(/'/g,"\\'")}')">🔔 AVÍSENME CUANDO ESTE PRODUCTO VUELVA EN STOCK ♥</button>`
      : '';
    return `<div class="product-card${p.soldOut?' soldout':''}" onclick="${p.soldOut?'':`showDetail(${p.id})`}"><div class="product-img-wrap">${img}${tag}${stockTag}${soldOverlay}${wlBtn}</div><div class="product-info"><div class="product-name">${p.name}</div><div class="product-price">${formatPriceDisplay(p)}${p.showCu!==false?' <span style="font-size:.72rem;color:#aaa;font-weight:600;">c/u</span>':''}</div>${waBtn}</div></div>`;
  }

  const CHUNK = 12;
  // Render first chunk immediately
  grid.innerHTML = filtered.slice(0, CHUNK).map(buildCard).join('');
  // Render the rest in small async chunks so the page stays responsive
  if (filtered.length > CHUNK) {
    let i = CHUNK;
    function renderNext() {
      if (i >= filtered.length) return;
      const fragment = filtered.slice(i, i + CHUNK).map(buildCard).join('');
      grid.insertAdjacentHTML('beforeend', fragment);
      i += CHUNK;
      if (i < filtered.length) requestAnimationFrame(renderNext);
    }
    requestAnimationFrame(renderNext);
  }
}
function renderTextBlocks() {
  const el=document.getElementById('text-blocks-container'); if(!el) return;
  if(store.textBlocks.length===0){el.innerHTML='';return;}
  el.innerHTML='<div style="max-width:1200px;margin:0 auto;padding:0 2.5rem 3rem;">'+store.textBlocks.map(tb=>`<div class="text-block" style="margin-bottom:1.5rem;"><h3>${tb.title}</h3><p>${tb.content}</p></div>`).join('')+'</div>';
}

// ═══════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════
function openLoginModal() {
  if(isAdmin){showAdmin();return;}
  document.getElementById('login-modal').classList.add('open');
  document.getElementById('login-user').value=''; document.getElementById('login-pass').value='';
  document.getElementById('login-error').style.display='none';
}
function closeLoginModal() { document.getElementById('login-modal').classList.remove('open'); }
function doLogin() {
  const u=document.getElementById('login-user').value.trim(), p=document.getElementById('login-pass').value;
  if(u==='admin'&&p===store.settings.password){isAdmin=true;closeLoginModal();showAdmin();}
  else{document.getElementById('login-error').style.display='block';}
}
function doLogout() { isAdmin=false; showHome(); }
window.openLoginModal=openLoginModal; window.closeLoginModal=closeLoginModal; window.doLogin=doLogin; window.doLogout=doLogout;

// ═══════════════════════════════════════════════
// ADMIN RENDER
// ═══════════════════════════════════════════════
function renderAdmin() {
  const s=store.settings;
  document.getElementById('set-brand').value=s.brand;
  document.getElementById('set-navbrand').value=s.navBrand||'';
  document.getElementById('set-font').value=s.font||'Barlow';
  document.getElementById('set-brandimg').value=s.brandImg||'';
  const pb=document.getElementById('preview-brandimg'), db2=document.getElementById('btn-del-brandimg');
  if(s.brandImg){pb.src=s.brandImg;pb.style.display='block';db2.style.display='inline-block';}else{pb.style.display='none';db2.style.display='none';}
  document.getElementById('set-herosub').value=s.heroSub;
  document.getElementById('set-wa').value=s.wa;
  document.getElementById('set-band').value=s.band;
  document.getElementById('set-footer').value=s.footer;
  document.getElementById('set-newpass').value='';
  const c=s.colors||{};
  document.getElementById('col-black').value=c.black||'#0A0A0A';
  document.getElementById('col-yellow').value=c.yellow||'#F5E642';
  document.getElementById('col-green').value=c.green||'#1DB954';
  document.getElementById('col-white').value=c.white||'#FAFAFA';
  document.getElementById('col-hero').value=c.hero||'#F5E642';
  document.getElementById('col-band').value=c.band||'#0A0A0A';
  document.getElementById('col-band-text').value=c.bandText||'#F5E642';
  document.getElementById('col-gray').value=c.gray||'#E8E8E8';
  renderAdminProducts(); renderAdminCategories(); renderAdminTextBlocks(); renderAdminWaitlist();
}

function renderAdminProducts() {
  const el=document.getElementById('admin-product-list'); if(!el) return;
  if(store.products.length===0){el.innerHTML='<p style="color:#999;font-size:.875rem;">No hay productos. Agrega el primero.</p>';return;}
  el.innerHTML=store.products.map(p=>`
    <div class="admin-product-item">
      <img src="${p.imgs&&p.imgs[0]?p.imgs[0]:''}" alt="${p.name}" loading="lazy" onerror="this.style.background='#eee'">
      <div class="api-info">
        <strong>${p.name}${p.soldOut?' <span style="color:#c00;font-size:.7rem;font-weight:900;">AGOTADO</span>':p.stock==='unique'?' <span style="color:#D0021B;font-size:.7rem;font-weight:900;">PIEZA ÚNICA</span>':p.stock==='last'?' <span style="color:#E05A00;font-size:.7rem;font-weight:900;">ÚLTIMA PIEZA</span>':p.stock==='collection'?' <span style="color:#6B2D8B;font-size:.7rem;font-weight:900;">ÚNICA COLECCIÓN</span>':p.stock==='low'?' <span style="color:#FF8C00;font-size:.7rem;font-weight:900;">POCAS</span>':''}</strong>
        <span>$ ${p.priceText||parseFloat(p.price).toFixed(2)}${p.category?' · '+p.category:''}${p.tag?' · '+p.tag:''}</span>
      </div>
      <div class="api-actions">
        <button class="edit-btn" onclick="openProductModal(${p.id})">Editar</button>
        <button class="del-btn" onclick="deleteProduct(${p.id})">Borrar</button>
      </div>
    </div>`).join('');
}
function renderAdminCategories() {
  const el=document.getElementById('admin-cat-list'); if(!el) return;
  const cats=(store.categories||['Todos']).filter(c=>c!=='Todos');
  if(cats.length===0){el.innerHTML='<p style="color:#999;font-size:.875rem;">Sin categorías adicionales.</p>';return;}
  el.innerHTML=cats.map(c=>`<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid #f0f0f0;"><span style="flex:1;font-weight:600;">${c}</span><button class="del-btn" onclick="deleteCategory('${c.replace(/'/g,"\\'")}')">Borrar</button></div>`).join('');
}
function renderAdminTextBlocks() {
  const el=document.getElementById('admin-text-blocks'); if(!el) return;
  if(store.textBlocks.length===0){el.innerHTML='<p style="color:#999;font-size:.875rem;">Sin bloques.</p>';return;}
  el.innerHTML=store.textBlocks.map(tb=>`<div class="text-block-admin-item"><div class="tba-header"><strong>${tb.title}</strong><div style="display:flex;gap:.5rem;"><button class="edit-btn" onclick="openTextBlockModal(${tb.id})">Editar</button><button class="del-btn" onclick="deleteTextBlock(${tb.id})">Borrar</button></div></div><p style="font-size:.875rem;color:#666;">${tb.content.substring(0,120)}${tb.content.length>120?'…':''}</p></div>`).join('');
}
window.renderAdminProducts=renderAdminProducts;

// ═══════════════════════════════════════════════
// SETTINGS SAVE
// ═══════════════════════════════════════════════
async function saveSettings() {
  const btn = document.getElementById('save-settings-btn');
  if(btn){btn.textContent='Guardando...';btn.disabled=true;}
  try {
    store.settings.brand=document.getElementById('set-brand').value.trim()||'The Lemon Club';
    store.settings.navBrand=document.getElementById('set-navbrand').value;
    store.settings.font=document.getElementById('set-font').value;
    store.settings.brandImg=document.getElementById('set-brandimg').value.trim();
    store.settings.heroSub=document.getElementById('set-herosub').value.trim();
    store.settings.wa=document.getElementById('set-wa').value.trim();
    store.settings.band=document.getElementById('set-band').value.trim();
    store.settings.footer=document.getElementById('set-footer').value.trim();
    const np=document.getElementById('set-newpass').value; if(np) store.settings.password=np;
    store.settings.colors={
      black:document.getElementById('col-black').value, yellow:document.getElementById('col-yellow').value,
      green:document.getElementById('col-green').value, white:document.getElementById('col-white').value,
      hero:document.getElementById('col-hero').value, band:document.getElementById('col-band').value,
      bandText:document.getElementById('col-band-text').value, gray:document.getElementById('col-gray').value
    };
    await saveSettingsToFB(store.settings);
    renderHome();
  } catch(e) {
    console.error('Error guardando configuración:', e);
  } finally {
    const b = document.getElementById('save-settings-btn');
    if(b){b.textContent='✓ Guardado';b.disabled=false;setTimeout(()=>{const b2=document.getElementById('save-settings-btn');if(b2)b2.textContent='Guardar';},2000);}
  }
}
window.saveSettings=saveSettings;

// ═══════════════════════════════════════════════
// PRODUCT CRUD
// ═══════════════════════════════════════════════
function openProductModal(id) {
  editingProductId=id||null;
  document.getElementById('pform-title').textContent=id?'Editar Producto':'Nuevo Producto';
  const cats=(store.categories||['Todos']).filter(c=>c!=='Todos');
  document.getElementById('pf-category').innerHTML='<option value="">Sin categoría</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(id){
    const p=store.products.find(x=>x.id==id);
    document.getElementById('pf-name').value=p.name;
    document.getElementById('pf-price').value=p.priceText||p.price||'';
    document.getElementById('pf-tag').value=p.tag||'';
    document.getElementById('pf-category').value=p.category||'';
    document.getElementById('pf-stock').value = p.soldOut ? 'soldout' : (p.stock || 'available');
    document.getElementById('pf-show-cu').checked = p.showCu !== false;
    document.getElementById('pf-desc').value=p.desc;
    document.getElementById('pf-img1').value=(p.imgs&&p.imgs[0])||'';
    document.getElementById('pf-img2').value=(p.imgs&&p.imgs[1])||'';
    document.getElementById('pf-img3').value=(p.imgs&&p.imgs[2])||'';
    [1,2,3].forEach(n=>restoreProductImgPreview(n,p.imgs&&p.imgs[n-1]));
  } else {
    ['pf-name','pf-price','pf-desc','pf-img1','pf-img2','pf-img3'].forEach(fid=>document.getElementById(fid).value='');
    document.getElementById('pf-tag').value=''; document.getElementById('pf-category').value='';
    document.getElementById('pf-stock').value='available';
    document.getElementById('pf-show-cu').checked=true;
    [1,2,3].forEach(n=>clearProductImg(n));
  }
  document.getElementById('product-modal').classList.add('open');
}
function closeProductModal() { document.getElementById('product-modal').classList.remove('open'); }
async function saveProduct() {
  const name=document.getElementById('pf-name').value.trim(), priceText=document.getElementById('pf-price').value.trim();
  const price=parseFloat(priceText)||0;
  if(!name||!priceText){alert('Completa nombre y precio');return;}
  const imgs=[document.getElementById('pf-img1').value.trim(),document.getElementById('pf-img2').value.trim(),document.getElementById('pf-img3').value.trim()].filter(Boolean);
  const prod={
    name, price, priceText:priceText, tag:document.getElementById('pf-tag').value,
    category:document.getElementById('pf-category').value,
    soldOut: document.getElementById('pf-stock').value === 'soldout',
    stock: document.getElementById('pf-stock').value,
    showCu: document.getElementById('pf-show-cu').checked,
    desc:document.getElementById('pf-desc').value.trim(), imgs,
    id: editingProductId || Date.now()
  };
  const saveBtn = document.querySelector('#product-modal .form-save-btn');
  if(saveBtn){saveBtn.textContent='Guardando...';saveBtn.disabled=true;}
  try {
    await saveProductToFB(prod);
    closeProductModal();
  } catch(e) {
    console.error('Error guardando producto:', e);
    showToast('Error al guardar. Verifica tu conexión e intenta de nuevo.');
  } finally {
    if(saveBtn){saveBtn.textContent='Guardar Producto';saveBtn.disabled=false;}
  }
}
async function deleteProduct(id) {
  if(!confirm('¿Eliminar este producto?')) return;
  const p = store.products.find(x => x.id == id);
  if (p && p.imgs) {
    for (const url of p.imgs) {
      if (url && url.startsWith('https://firebasestorage')) {
        try {
          const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
          await deleteObject(storageRef(storage, path));
        } catch(e) {}
      }
    }
  }
  await deleteProductFromFB(id);
}
window.openProductModal=openProductModal; window.closeProductModal=closeProductModal;
window.saveProduct=saveProduct; window.deleteProduct=deleteProduct;

function handleProductImg(input, n) {
  const file=input.files[0]; if(!file) return;
  const prev=document.getElementById('prev-pf-img'+n);
  prev.style.display='block'; prev.style.opacity='.4';
  compressImage(file, 600, 800, 0.85, async b64 => {
    if (!b64) { prev.style.opacity='1'; return; }
    prev.src=b64;
    prev.style.display='block'; prev.style.opacity='1';
    document.getElementById('pf-img'+n).value=b64;
    document.getElementById('del-pf-img'+n).style.display='inline-block';
    try {
      const url = await uploadToStorage(b64, `products/img_${Date.now()}_${n}.jpg`);
      document.getElementById('pf-img'+n).value=url;
    } catch(e) {}
  }, true);
}
function clearProductImg(n) {
  document.getElementById('pf-img'+n).value='';
  document.getElementById('upload-pf-img'+n).value='';
  const prev=document.getElementById('prev-pf-img'+n);
  prev.src=''; prev.style.display='none';
  document.getElementById('del-pf-img'+n).style.display='none';
}
function restoreProductImgPreview(n, src) {
  if(!src) { clearProductImg(n); return; }
  const prev=document.getElementById('prev-pf-img'+n);
  prev.src=src; prev.style.display='block';
  document.getElementById('del-pf-img'+n).style.display='inline-block';
}
window.handleProductImg=handleProductImg; window.clearProductImg=clearProductImg;

// ═══════════════════════════════════════════════
// CATEGORY CRUD
// ═══════════════════════════════════════════════
async function addCategory() {
  const name=document.getElementById('cat-new-name').value.trim();
  if(!name){alert('Escribe el nombre');return;}
  if(store.categories.includes(name)){alert('Esa categoría ya existe');return;}
  const newCats=[...store.categories, name];
  await saveCategoriesToFB(newCats);
  document.getElementById('cat-new-name').value='';
  document.getElementById('cat-modal').classList.remove('open');
}
async function deleteCategory(name) {
  if(!confirm(`¿Eliminar la categoría "${name}"?`)) return;
  const newCats=store.categories.filter(c=>c!==name);
  // Remove category from products that use it
  const prods=store.products.filter(p=>p.category===name);
  for(const p of prods){ await saveProductToFB({...p, category:''}); }
  await saveCategoriesToFB(newCats);
}
window.addCategory=addCategory; window.deleteCategory=deleteCategory;

// ═══════════════════════════════════════════════
// TEXT BLOCK CRUD
// ═══════════════════════════════════════════════
function openTextBlockModal(id) {
  editingTextBlockId=id||null;
  document.getElementById('tbform-title').textContent=id?'Editar Bloque':'Nuevo Bloque de Texto';
  if(id){const tb=store.textBlocks.find(x=>x.id==id);document.getElementById('tb-title').value=tb.title;document.getElementById('tb-content').value=tb.content;}
  else{document.getElementById('tb-title').value='';document.getElementById('tb-content').value='';}
  document.getElementById('textblock-modal').classList.add('open');
}
function closeTextBlockModal() { document.getElementById('textblock-modal').classList.remove('open'); }
async function saveTextBlock() {
  const title=document.getElementById('tb-title').value.trim(), content=document.getElementById('tb-content').value.trim();
  if(!title||!content){alert('Completa título y texto');return;}
  const tb={ title, content, id: editingTextBlockId||Date.now() };
  await saveTextBlockToFB(tb);
  closeTextBlockModal();
}
async function deleteTextBlock(id) {
  if(!confirm('¿Eliminar este bloque?')) return;
  await deleteTextBlockFromFB(id);
}
window.openTextBlockModal=openTextBlockModal; window.closeTextBlockModal=closeTextBlockModal;
window.saveTextBlock=saveTextBlock; window.deleteTextBlock=deleteTextBlock;


// ═══════════════════════════════════════════════
// CART
// ═══════════════════════════════════════════════
let cart = [];
let currentDetailId = null;
let detailQty = 1;

function openCart() {
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
  renderCart();
}
function closeCart() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
}
window.openCart = openCart; window.closeCart = closeCart;

function parseUnitPrice(p) {
  const txt = (p.priceText || String(p.price || 0)).trim();
  // Bundle "2x5" → 1 pack costs $5 (the total, not divided)
  const bundle = txt.match(/^(\d+)\s*[xX×]\s*(\d+[\d.]*)$/);
  if (bundle) return parseFloat(bundle[2]);
  return parseFloat(txt) || parseFloat(p.price) || 0;
}

function addToCart(productId, qty) {
  qty = qty || 1;
  const p = store.products.find(x => x.id == productId);
  if (!p || p.soldOut) return;
  const existing = cart.find(c => c.id == productId);
  if (existing) { existing.qty += qty; }
  else { cart.push({ id: p.id, name: p.name, price: parseUnitPrice(p), img: (p.imgs && p.imgs[0]) || '', qty }); }
  updateCartBadge();
  showToast('✓ Agregado al carrito');
}
window.addToCart = addToCart;

function addToCartFromDetail() {
  if (!currentDetailId) return;
  addToCart(currentDetailId, detailQty);
  const btn = document.getElementById('detail-add-cart-btn');
  if (!btn) return;
  btn.textContent = '✓ Agregado al carrito';
  btn.classList.add('added');
  setTimeout(() => { btn.textContent = '+ Agregar al carrito'; btn.classList.remove('added'); }, 2000);
}
window.addToCartFromDetail = addToCartFromDetail;

function changeDetailQty(delta) {
  detailQty = Math.max(1, detailQty + delta);
  const el = document.getElementById('detail-qty-num');
  if (el) el.textContent = detailQty;
}
window.changeDetailQty = changeDetailQty;

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  badge.textContent = total;
  total > 0 ? badge.classList.add('show') : badge.classList.remove('show');
  badge.style.transform = 'scale(1.4)';
  setTimeout(() => { badge.style.transform = ''; }, 300);
}

function renderCart() {
  const el = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const waBtn = document.getElementById('cart-wa-btn');
  if (!el) return;
  if (cart.length === 0) {
    el.innerHTML = '<div class="cart-empty"><span style="font-size:2.5rem;">🛒</span><span>Tu carrito está vacío</span><span style="font-size:.75rem;color:#ddd;text-transform:none;letter-spacing:0;">Agrega productos desde el catálogo</span></div>';
    if (totalEl) totalEl.textContent = '0.00';
    if (waBtn) waBtn.disabled = true;
    return;
  }
  if (waBtn) waBtn.disabled = false;
  let total = 0;
  el.innerHTML = cart.map((item, i) => {
    total += item.price * item.qty;
    const imgHtml = item.img
      ? `<img class="cart-item-img" src="${item.img}" alt="${item.name}">`
      : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:1.5rem;">📷</div>`;
    return `<div class="cart-item">
      ${imgHtml}
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">$ ${(item.price * item.qty).toFixed(2)} <span style="color:#bbb;font-size:.75rem;">(${item.qty} × $ ${item.price.toFixed(2)})</span></div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeCartQty(${i},-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeCartQty(${i},1)">+</button>
        </div>
      </div>
      <button class="cart-item-del" onclick="removeFromCart(${i})" title="Eliminar">✕</button>
    </div>`;
  }).join('');
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

function changeCartQty(index, delta) {
  if (!cart[index]) return;
  cart[index].qty = Math.max(1, cart[index].qty + delta);
  updateCartBadge();
  renderCart();
}
function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartBadge();
  renderCart();
}
function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('¿Vaciar el carrito?')) return;
  cart = [];
  updateCartBadge();
  renderCart();
}
function sendCartToWA() {
  if (cart.length === 0) return;
  const brand = store.settings.brand || 'The Lemon Club';
  const lines = cart.map(item => `  • ${item.name} × ${item.qty}  →  $ ${(item.price * item.qty).toFixed(2)}`);
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const msg = `¡Hola! Quisiera hacer el siguiente pedido en ${brand}:\n\n${lines.join('\n')}\n\n💰 Total estimado: $ ${total.toFixed(2)}\n\n¿Cómo procedo para confirmar?`;
  openWA(msg);
}
window.changeCartQty = changeCartQty; window.removeFromCart = removeFromCart;
window.clearCart = clearCart; window.sendCartToWA = sendCartToWA;

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
let searchSelectedIdx = -1;

function toggleSearch() {
  const bar = document.getElementById('search-bar');
  const btn = document.getElementById('search-btn');
  const isOpen = bar.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
  if (isOpen) {
    setTimeout(() => document.getElementById('search-input').focus(), 80);
  } else {
    clearSearch();
  }
}

function clearSearch() {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');
  const clearBtn = document.getElementById('search-clear-btn');
  if (input) input.value = '';
  if (dropdown) { dropdown.innerHTML = ''; dropdown.classList.remove('open'); }
  if (clearBtn) clearBtn.classList.remove('show');
  searchSelectedIdx = -1;
}

function closeSearch() {
  const bar = document.getElementById('search-bar');
  const btn = document.getElementById('search-btn');
  bar.classList.remove('open');
  btn.classList.remove('active');
  clearSearch();
}

function onSearchInput(q) {
  const clearBtn = document.getElementById('search-clear-btn');
  const dropdown = document.getElementById('search-dropdown');
  searchSelectedIdx = -1;
  q = q.trim();
  if (clearBtn) clearBtn.classList.toggle('show', q.length > 0);
  if (!q) { dropdown.innerHTML = ''; dropdown.classList.remove('open'); return; }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const results = store.products
    .filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);

  if (results.length === 0) {
    dropdown.innerHTML = `<div class="search-no-results">Sin resultados para "${q}"</div>`;
    dropdown.classList.add('open');
    return;
  }

  const tagColors = { nuevo:'#1DB954', preventa:'#0A0A0A', oferta:'#FF3B3B', low:'#FF8C00', last:'#E05A00', unique:'#D0021B' };
  dropdown.innerHTML = results.map((p, i) => {
    const highlighted = p.name.replace(regex, m => `<mark>${m}</mark>`);
    const img = p.imgs && p.imgs[0]
      ? `<img class="search-result-img" src="${p.imgs[0]}" alt="${p.name}" loading="lazy">`
      : `<div class="search-result-img-ph">📷</div>`;
    const price = p.priceText || parseFloat(p.price || 0).toFixed(2);
    const tagLabel = { nuevo:'Nuevo', preventa:'Preventa', oferta:'Oferta', low:'Pocas unidades', last:'Última pieza', unique:'Pieza única' }[p.tag || p.stock] || '';
    const tagColor = tagColors[p.tag] || tagColors[p.stock] || '#888';
    const tagHtml = p.soldOut
      ? `<span class="search-result-tag search-result-tag-soldout">AGOTADO</span>`
      : (tagLabel ? `<span class="search-result-tag" style="background:${tagColor};">${tagLabel}</span>` : '');
    return `<div class="search-result${p.soldOut?' search-result-soldout':''}" data-idx="${i}" onclick="closeSearch();showDetail(${p.id})">${img}<div class="search-result-info"><div class="search-result-name">${highlighted}</div><div class="search-result-price">$ ${price}</div>${tagHtml}</div></div>`;
  }).join('');
  dropdown.classList.add('open');
}

function onSearchKey(e) {
  const dropdown = document.getElementById('search-dropdown');
  const items = dropdown.querySelectorAll('.search-result');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchSelectedIdx = Math.min(searchSelectedIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchSelectedIdx = Math.max(searchSelectedIdx - 1, 0);
  } else if (e.key === 'Enter' && searchSelectedIdx >= 0) {
    items[searchSelectedIdx].click();
    return;
  } else if (e.key === 'Escape') {
    closeSearch(); return;
  } else { return; }
  items.forEach((el, i) => el.style.background = i === searchSelectedIdx ? '#f0f0ee' : '');
  if (items[searchSelectedIdx]) items[searchSelectedIdx].scrollIntoView({ block: 'nearest' });
}

document.addEventListener('click', e => {
  const bar = document.getElementById('search-bar');
  const btn = document.getElementById('search-btn');
  if (bar && bar.classList.contains('open') && !bar.contains(e.target) && !btn.contains(e.target)) {
    closeSearch();
  }
});

window.toggleSearch = toggleSearch;
window.clearSearch = clearSearch;
window.closeSearch = closeSearch;
window.onSearchInput = onSearchInput;
window.onSearchKey = onSearchKey;


// ═══════════════════════════════════════════════
// SECRET ADMIN ACCESS (click brand 5x)
// ═══════════════════════════════════════════════
let _secretClicks = 0, _secretTimer = null;
function secretAdminClick() {
  _secretClicks++;
  clearTimeout(_secretTimer);
  if (_secretClicks >= 5) {
    _secretClicks = 0;
    openLoginModal();
  } else {
    _secretTimer = setTimeout(() => {
      // If only 1 click (normal tap) → open WhatsApp
      if (_secretClicks === 1) {
        openWA('Hola! Quiero información sobre The Lemon Club 🍋');
      }
      _secretClicks = 0;
    }, 600);
  }
}
window.secretAdminClick = secretAdminClick;

// ─── Secret URL access (?admin) ───
if (new URLSearchParams(window.location.search).has('admin')) {
  history.replaceState(null, '', window.location.pathname);
  window.addEventListener('appReady', () => openLoginModal(), { once: true });
}

// ─── Close modals on outside click ───
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click', e=>{ if(e.target===m) m.classList.remove('open'); });
});
// cat modal close button
const catModalBtn = document.querySelector('#cat-modal .modal-close');
if(catModalBtn) catModalBtn.onclick = ()=>document.getElementById('cat-modal').classList.remove('open');
// cat modal add on enter
document.getElementById('cat-new-name').addEventListener('keydown', e=>{ if(e.key==='Enter') addCategory(); });

// ─── SERVICE WORKER ───
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── PWA INSTALL PROMPT ───
let _installPrompt = null;
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

// Mostrar el botón siempre que no esté corriendo como app instalada.
// No depender de beforeinstallprompt porque el navegador no lo dispara
// de nuevo inmediatamente después de desinstalar (tiene un cooldown).
if (!_isStandalone) {
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = '';
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
});
window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'none';
});

function installApp() {
  if (_installPrompt) {
    _installPrompt.prompt();
    _installPrompt.userChoice.then(() => { _installPrompt = null; });
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'none';
    return;
  }
  // No hay prompt nativo disponible: mostrar instrucciones según dispositivo
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const body = document.getElementById('install-modal-body');
  if (body) {
    if (isIOS) {
      body.innerHTML = `
        <p style="margin-bottom:1.25rem;color:#555;font-size:.9rem;line-height:1.6;">Sigue estos pasos en Safari:</p>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">1️⃣</span>
            <span style="font-size:.9rem;color:#333;">Toca el botón de compartir <strong>□↑</strong> en la barra inferior del navegador</span>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">2️⃣</span>
            <span style="font-size:.9rem;color:#333;">Desplázate y toca <strong>"Agregar a pantalla de inicio"</strong></span>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">3️⃣</span>
            <span style="font-size:.9rem;color:#333;">Toca <strong>"Agregar"</strong> para confirmar</span>
          </div>
        </div>`;
    } else if (isAndroid) {
      body.innerHTML = `
        <p style="margin-bottom:1.25rem;color:#555;font-size:.9rem;line-height:1.6;">Sigue estos pasos en Chrome:</p>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">1️⃣</span>
            <span style="font-size:.9rem;color:#333;">Toca el menú <strong>⋮</strong> (tres puntos) arriba a la derecha</span>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">2️⃣</span>
            <span style="font-size:.9rem;color:#333;">Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong></span>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">3️⃣</span>
            <span style="font-size:.9rem;color:#333;">Toca <strong>"Instalar"</strong> para confirmar</span>
          </div>
        </div>
        <p style="margin-top:1.25rem;color:#aaa;font-size:.78rem;line-height:1.5;">Si no ves la opción, espera unos segundos y vuelve a intentarlo desde el botón.</p>`;
    } else {
      body.innerHTML = `
        <p style="margin-bottom:1.25rem;color:#555;font-size:.9rem;line-height:1.6;">Sigue estos pasos en tu navegador:</p>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">1️⃣</span>
            <span style="font-size:.9rem;color:#333;">Busca el ícono <strong>⊕</strong> al final de la barra de direcciones</span>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-size:1.5rem;min-width:2rem;text-align:center;">2️⃣</span>
            <span style="font-size:.9rem;color:#333;">O abre el menú del navegador y selecciona <strong>"Instalar The Lemon Club"</strong></span>
          </div>
        </div>`;
    }
  }
  document.getElementById('install-modal').classList.add('open');
}
window.installApp = installApp;

// ═══════════════════════════════════════════════
// WAITLIST — Lista de espera
// ═══════════════════════════════════════════════

let _wlProductId = null, _wlProductName = '';

function openWaitlistModal(productId, productName) {
  _wlProductId = productId;
  _wlProductName = productName;
  const nameEl = document.getElementById('wl-modal-product-name');
  if (nameEl) nameEl.textContent = productName;
  document.getElementById('wl-nombre').value = '';
  document.getElementById('wl-whatsapp').value = '';
  const errEl = document.getElementById('wl-error');
  const successEl = document.getElementById('wl-success');
  const formBody = document.getElementById('wl-form-body');
  if (errEl) errEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';
  if (formBody) formBody.style.display = 'block';
  const btn = document.getElementById('wl-submit-btn');
  if (btn) { btn.textContent = 'Enviar'; btn.disabled = false; }
  document.getElementById('waitlist-modal').classList.add('open');
}

function closeWaitlistModal() {
  document.getElementById('waitlist-modal').classList.remove('open');
  _wlProductId = null; _wlProductName = '';
}

async function submitWaitlist() {
  const nombre = document.getElementById('wl-nombre').value.trim();
  const whatsapp = document.getElementById('wl-whatsapp').value.trim();
  const errEl = document.getElementById('wl-error');
  const successEl = document.getElementById('wl-success');
  const formBody = document.getElementById('wl-form-body');
  const btn = document.getElementById('wl-submit-btn');

  if (!nombre) {
    errEl.textContent = 'Por favor ingresa tu nombre.';
    errEl.style.display = 'block'; return;
  }
  const waClean = whatsapp.replace(/\s+/g, '');
  const waDigits = waClean.replace(/[^\d]/g, '');
  if (!waClean || waDigits.length < 10) {
    errEl.textContent = 'Ingresa un número de WhatsApp válido (mínimo 10 dígitos).';
    errEl.style.display = 'block'; return;
  }
  errEl.style.display = 'none';
  btn.textContent = 'Enviando...'; btn.disabled = true;

  try {
    const dupQ = query(waitlistCol,
      where('whatsapp', '==', waClean),
      where('productoId', '==', String(_wlProductId))
    );
    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      formBody.style.display = 'none';
      successEl.textContent = '¡Ya estás en la lista para este producto! 🍋';
      successEl.style.display = 'block';
      return;
    }
    await addDoc(waitlistCol, {
      nombre,
      whatsapp: waClean,
      productoId: String(_wlProductId),
      productoNombre: _wlProductName,
      fecha: serverTimestamp(),
      notificada: false
    });
    formBody.style.display = 'none';
    successEl.textContent = '¡Listo! Te avisaremos cuando vuelva 🍋💚';
    successEl.style.display = 'block';
  } catch(e) {
    console.error('Waitlist error:', e);
    errEl.textContent = 'Ocurrió un error. Por favor intenta de nuevo.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Enviar'; btn.disabled = false;
  }
}

window.openWaitlistModal = openWaitlistModal;
window.closeWaitlistModal = closeWaitlistModal;
window.submitWaitlist = submitWaitlist;

// ─── Admin waitlist ───
let _wlFilter = 'Todos', _wlStatusFilter = 'pendientes';

function formatWANumber(phone) {
  let n = (phone || '').replace(/[\s\-()]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  const digits = n.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return '58' + digits.slice(1);
  if (digits.length === 10) return '58' + digits;
  return digits;
}

async function renderAdminWaitlist() {
  const el = document.getElementById('admin-waitlist-list');
  const summaryEl = document.getElementById('admin-waitlist-summary');
  const filterEl = document.getElementById('wl-filter-product');
  const statusEl = document.getElementById('wl-filter-status');
  if (!el || !summaryEl || !filterEl) return;

  el.innerHTML = '<p style="color:#999;font-size:.875rem;">Cargando...</p>';
  try {
    const snap = await getDocs(waitlistCol);
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    all.sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));

    // Summary by product, ordered by count
    const byProduct = {};
    all.forEach(r => { byProduct[r.productoNombre] = (byProduct[r.productoNombre] || 0) + 1; });
    const sorted = Object.entries(byProduct).sort((a, b) => b[1] - a[1]);
    summaryEl.innerHTML = sorted.length === 0
      ? '<p style="color:#999;font-size:.875rem;margin:0;">Sin registros aún.</p>'
      : sorted.map(([nombre, count]) =>
          `<div class="wl-summary-card"><span class="wl-summary-name">${nombre}</span><span class="wl-summary-count">${count} interesada${count !== 1 ? 's' : ''}</span><button class="wl-del-btn" onclick="deleteWaitlistProduct('${nombre.replace(/'/g,"\\'")}')">✕</button></div>`
        ).join('');

    // Product filter dropdown
    const prods = ['Todos', ...Object.keys(byProduct)];
    filterEl.innerHTML = prods.map(p =>
      `<option value="${p}"${p === _wlFilter ? ' selected' : ''}>${p === 'Todos' ? 'Todos los productos' : p}</option>`
    ).join('');
    if (statusEl) statusEl.value = _wlStatusFilter;

    // Apply filters
    let filtered = all;
    if (_wlFilter !== 'Todos') filtered = filtered.filter(r => r.productoNombre === _wlFilter);
    if (_wlStatusFilter === 'pendientes') filtered = filtered.filter(r => !r.notificada);
    else if (_wlStatusFilter === 'notificadas') filtered = filtered.filter(r => r.notificada);

    if (filtered.length === 0) {
      el.innerHTML = '<p style="color:#999;font-size:.875rem;">No hay registros para este filtro.</p>';
      return;
    }

    el.innerHTML = filtered.map(r => {
      const fecha = r.fecha?.seconds
        ? new Date(r.fecha.seconds * 1000).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—';
      const waNum = formatWANumber(r.whatsapp);
      const msg = encodeURIComponent(`¡Hola ${r.nombre}! 🍋 Te escribimos de The Lemon Club: ${r.productoNombre} ya está de nuevo en stock 💚 ¡Corre que vuelan!`);
      return `<div class="wl-item${r.notificada ? ' wl-notificada' : ''}">
        <div class="wl-item-info">
          <div class="wl-item-name">${r.nombre}${r.notificada ? ' <span class="wl-check">✓ Notificada</span>' : ''}</div>
          <div class="wl-item-meta">${r.whatsapp} · ${r.productoNombre} · ${fecha}</div>
        </div>
        <div class="wl-item-actions">
          <a class="wl-wa-btn" href="https://wa.me/${waNum}?text=${msg}" target="_blank" rel="noopener">💬 WhatsApp</a>
          ${!r.notificada ? `<button class="wl-mark-btn" onclick="markWaitlistNotified('${r.id}')">✓ Notificada</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('Admin waitlist error:', e);
    el.innerHTML = '<p style="color:#c00;font-size:.875rem;">Error cargando la lista. Verifica las reglas de Firestore.</p>';
  }
}

async function deleteWaitlistProduct(productoNombre) {
  if (!confirm(`¿Eliminar TODOS los registros de "${productoNombre}" de la lista de espera?`)) return;
  try {
    const q = query(waitlistCol, where('productoNombre', '==', productoNombre));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'waitlist', d.id))));
    renderAdminWaitlist();
  } catch(e) {
    showToast('Error al eliminar los registros.');
  }
}

async function markWaitlistNotified(docId) {
  try {
    await updateDoc(doc(db, 'waitlist', docId), { notificada: true });
    renderAdminWaitlist();
  } catch(e) {
    showToast('Error al actualizar el registro.');
  }
}

function setWLFilter(val) { _wlFilter = val; renderAdminWaitlist(); }
function setWLStatusFilter(val) { _wlStatusFilter = val; renderAdminWaitlist(); }

window.renderAdminWaitlist = renderAdminWaitlist;
window.markWaitlistNotified = markWaitlistNotified;
window.deleteWaitlistProduct = deleteWaitlistProduct;
window.setWLFilter = setWLFilter;
window.setWLStatusFilter = setWLStatusFilter;

// ─── Patch showDetail: inyectar botón waitlist en página de detalle ───
const _origShowDetail = window.showDetail;
window.showDetail = function(id) {
  _origShowDetail(id);
  const p = store.products.find(x => x.id == id);
  const wlWrap = document.getElementById('detail-wl-wrap');
  if (!wlWrap) return;
  if (p && p.soldOut) {
    const safeName = (p.name || '').replace(/'/g, "\\'");
    wlWrap.innerHTML = `<button class="wl-btn" onclick="openWaitlistModal('${p.id}','${safeName}')">🔔 AVÍSENME CUANDO ESTE PRODUCTO VUELVA EN STOCK ♥</button>`;
    wlWrap.style.display = 'block';
  } else {
    wlWrap.innerHTML = '';
    wlWrap.style.display = 'none';
  }
};
