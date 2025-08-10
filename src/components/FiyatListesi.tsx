import React, { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { useNotify } from '../hooks/useNotify';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';

dayjs.locale('tr');

interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  sku: string;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  description?: string;
  supplier?: string;
  barcode?: string;
  createdAt: string;
  updatedAt: string;
}

interface StockMovement {
  id: string;
  productId: string;
  type: 'in' | 'out' | 'adjustment' | 'sale';
  quantity: number;
  reason: string;
  date: string;
  notes?: string;
  salePrice?: number;
  profit?: number;
}

interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  profit: number;
  date: string;
  customerName?: string;
  notes?: string;
}

const FiyatListesi: React.FC = () => {
  const { user } = useAuth();
  const { notifyWarning } = useNotify();
  const [currentView, setCurrentView] = useState<'dashboard' | 'products' | 'stock-movements' | 'sales' | 'reports' | 'settings'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [stockData, setStockData] = useState({ quantity: 0, reason: '', type: 'in' as 'in' | 'out' | 'adjustment' });
  const [saleData, setSaleData] = useState({ quantity: 1, unitPrice: 0, customerName: '', notes: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');

  // Load demo data
  const loadDemoData = useCallback(() => {
    const demoProducts: Product[] = [
      {
        id: '1',
        name: 'Samsung Galaxy S24',
        category: 'Elektronik',
        brand: 'Samsung',
        sku: 'SGS24-128-BLK',
        buyPrice: 25000,
        sellPrice: 30000,
        stock: 15,
        minStock: 5,
        unit: 'adet',
        description: 'Samsung Galaxy S24 128GB Siyah',
        supplier: 'TechDistribute',
        barcode: '8806095048245',
        createdAt: dayjs().subtract(30, 'day').toISOString(),
        updatedAt: dayjs().subtract(1, 'day').toISOString()
      },
      {
        id: '2',
        name: 'iPhone 15 Pro',
        category: 'Elektronik',
        brand: 'Apple',
        sku: 'IP15P-256-TB',
        buyPrice: 45000,
        sellPrice: 52000,
        stock: 8,
        minStock: 3,
        unit: 'adet',
        description: 'iPhone 15 Pro 256GB Titanium Blue',
        supplier: 'AppleStore TR',
        barcode: '194253773123',
        createdAt: dayjs().subtract(25, 'day').toISOString(),
        updatedAt: dayjs().subtract(2, 'day').toISOString()
      },
      {
        id: '3',
        name: 'MacBook Air M3',
        category: 'Bilgisayar',
        brand: 'Apple',
        sku: 'MBA-M3-256-SG',
        buyPrice: 32000,
        sellPrice: 38000,
        stock: 2,
        minStock: 2,
        unit: 'adet',
        description: 'MacBook Air 13" M3 256GB Space Gray',
        supplier: 'AppleStore TR',
        barcode: '195949038273',
        createdAt: dayjs().subtract(20, 'day').toISOString(),
        updatedAt: dayjs().toISOString()
      },
      {
        id: '4',
        name: 'Logitech MX Master 3S',
        category: 'Aksesuar',
        brand: 'Logitech',
        sku: 'LGT-MXM3S-GR',
        buyPrice: 2500,
        sellPrice: 3200,
        stock: 25,
        minStock: 10,
        unit: 'adet',
        description: 'Logitech MX Master 3S Wireless Mouse Graphite',
        supplier: 'LogitechTR',
        barcode: '097855154149',
        createdAt: dayjs().subtract(15, 'day').toISOString(),
        updatedAt: dayjs().subtract(3, 'day').toISOString()
      },
      {
        id: '5',
        name: 'Sony WH-1000XM5',
        category: 'Ses Sistemi',
        brand: 'Sony',
        sku: 'SNY-WH1000XM5-BLK',
        buyPrice: 8500,
        sellPrice: 11000,
        stock: 12,
        minStock: 5,
        unit: 'adet',
        description: 'Sony WH-1000XM5 Kablosuz Gürültü Engelleyici Kulaklık',
        supplier: 'SonyMusic TR',
        barcode: '027242922020',
        createdAt: dayjs().subtract(10, 'day').toISOString(),
        updatedAt: dayjs().subtract(1, 'day').toISOString()
      }
    ];

    const demoMovements: StockMovement[] = [
      {
        id: '1',
        productId: '1',
        type: 'in',
        quantity: 20,
        reason: 'Yeni stok girişi',
        date: dayjs().subtract(30, 'day').toISOString(),
        notes: 'İlk stok girişi'
      },
      {
        id: '2',
        productId: '1',
        type: 'out',
        quantity: 5,
        reason: 'Satış',
        date: dayjs().subtract(1, 'day').toISOString(),
        notes: 'Müşteri siparişi'
      },
      {
        id: '3',
        productId: '3',
        type: 'adjustment',
        quantity: -1,
        reason: 'Hasar',
        date: dayjs().toISOString(),
        notes: 'Kargo hasarı'
      }
    ];

    setProducts(demoProducts);
    setStockMovements(demoMovements);
  }, []);

  // Load data from Firebase
  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Load products from subcollection
      const productsCollectionRef = collection(db, 'userData', user.uid, 'products');
      const productsSnapshot = await getDocs(productsCollectionRef);
      const loadedProducts: Product[] = [];
      
      productsSnapshot.forEach((doc) => {
        loadedProducts.push({ id: doc.id, ...doc.data() } as Product);
      });
      
      // Load sales from subcollection
      const salesCollectionRef = collection(db, 'userData', user.uid, 'sales');
      const salesSnapshot = await getDocs(salesCollectionRef);
      const loadedSales: Sale[] = [];
      
      salesSnapshot.forEach((doc) => {
        loadedSales.push({ id: doc.id, ...doc.data() } as Sale);
      });
      
      // Load stock movements from subcollection
      const movementsCollectionRef = collection(db, 'userData', user.uid, 'stockMovements');
      const movementsSnapshot = await getDocs(movementsCollectionRef);
      const loadedMovements: StockMovement[] = [];
      
      movementsSnapshot.forEach((doc) => {
        loadedMovements.push({ id: doc.id, ...doc.data() } as StockMovement);
      });
      
      if (loadedProducts.length > 0) {
        setProducts(loadedProducts);
        setSales(loadedSales);
        setStockMovements(loadedMovements);
      } else {
        loadDemoData();
      }
      
    } catch (error) {
      console.error('Stok veri yükleme hatası:', error);
      loadDemoData();
    }
  }, [user, loadDemoData]);

  // Save individual product to Firebase (for new products)
  const saveProduct = async (product: Product) => {
    if (!user) return;
    
    try {
      const productsCollectionRef = collection(db, 'userData', user.uid, 'products');
      if (product.id && product.id !== 'new') {
        // Update existing product
        const productDocRef = doc(productsCollectionRef, product.id);
        await updateDoc(productDocRef, { ...product, updatedAt: serverTimestamp() });
      } else {
        // Add new product
        await addDoc(productsCollectionRef, { ...product, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
    } catch (error) {
      console.error('Ürün kaydetme hatası:', error);
    }
  };

  // Save sale to Firebase
  const saveSale = async (sale: Sale) => {
    if (!user) return;
    
    try {
      const salesCollectionRef = collection(db, 'userData', user.uid, 'sales');
      await addDoc(salesCollectionRef, { ...sale, createdAt: serverTimestamp() });
    } catch (error) {
      console.error('Satış kaydetme hatası:', error);
    }
  };

  // Save stock movement to Firebase
  const saveStockMovement = async (movement: StockMovement) => {
    if (!user) return;
    
    try {
      const movementsCollectionRef = collection(db, 'userData', user.uid, 'stockMovements');
      await addDoc(movementsCollectionRef, { ...movement, createdAt: serverTimestamp() });
    } catch (error) {
      console.error('Stok hareketi kaydetme hatası:', error);
    }
  };


  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const addProduct = async () => {
    if (!formData.name || !formData.buyPrice || !formData.sellPrice) return;

    const newProduct: Product = {
      id: Date.now().toString(),
      name: formData.name,
      category: formData.category || 'Diğer',
      brand: formData.brand || '',
      sku: formData.sku || `SKU-${Date.now()}`,
      buyPrice: formData.buyPrice,
      sellPrice: formData.sellPrice,
      stock: formData.stock || 0,
      minStock: formData.minStock || 0,
      unit: formData.unit || 'adet',
      description: formData.description,
      supplier: formData.supplier,
      barcode: formData.barcode,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString()
    };

    const newProducts = [...products, newProduct];
    setProducts(newProducts);
    await saveProduct(newProduct);
    setShowProductModal(false);
    setFormData({});
  };

  const updateProduct = async () => {
    if (!selectedProduct || !formData.name || !formData.buyPrice || !formData.sellPrice) return;

    const updatedProducts = products.map(product =>
      product.id === selectedProduct.id
        ? { ...product, ...formData, updatedAt: dayjs().toISOString() }
        : product
    );

    setProducts(updatedProducts);
    const updatedProduct = updatedProducts.find(p => p.id === selectedProduct.id);
    if (updatedProduct) await saveProduct(updatedProduct);
    setShowProductModal(false);
    setSelectedProduct(null);
    setFormData({});
  };

  const deleteProduct = async (productId: string) => {
    if (!window.confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return;
    const updatedProducts = products.filter(product => product.id !== productId);
    const updatedMovements = stockMovements.filter(movement => movement.productId !== productId);
    setProducts(updatedProducts);
    setStockMovements(updatedMovements);
    
    try {
      const productsCollectionRef = collection(db, 'userData', user?.uid || '', 'products');
      const productDocRef = doc(productsCollectionRef, productId);
      await deleteDoc(productDocRef);
    } catch (error) {
      console.error('Ürün silme hatası:', error);
    }
  };

  const updateStock = async () => {
    if (!selectedProduct || stockData.quantity === 0) return;

    const movement: StockMovement = {
      id: Date.now().toString(),
      productId: selectedProduct.id,
      type: stockData.type,
      quantity: stockData.quantity,
      reason: stockData.reason,
      date: dayjs().toISOString(),
      notes: ''
    };

    const updatedProducts = products.map(product => {
      if (product.id === selectedProduct.id) {
        let newStock = product.stock;
        
        if (stockData.type === 'in') {
          newStock += stockData.quantity;
        } else if (stockData.type === 'out') {
          newStock = Math.max(0, newStock - stockData.quantity);
        } else {
          newStock = Math.max(0, newStock + stockData.quantity);
        }

        return {
          ...product,
          stock: newStock,
          updatedAt: dayjs().toISOString()
        };
      }
      return product;
    });

    const updatedMovements = [movement, ...stockMovements];
    setProducts(updatedProducts);
    setStockMovements(updatedMovements);
    
    // Save to Firebase
    const updatedProduct = updatedProducts.find(p => p.id === selectedProduct.id);
    if (updatedProduct) {
      await saveProduct(updatedProduct);
      await saveStockMovement(movement);
    }
    setShowStockModal(false);
    setSelectedProduct(null);
    setStockData({ quantity: 0, reason: '', type: 'in' });
  };

  const openEditModal = (product: Product) => {
    setSelectedProduct(product);
    setFormData(product);
    setShowProductModal(true);
  };

  const openStockModal = (product: Product) => {
    setSelectedProduct(product);
    setStockData({ quantity: 0, reason: '', type: 'in' });
    setShowStockModal(true);
  };

  const openSaleModal = (product: Product) => {
    setSelectedProduct(product);
    setSaleData({ quantity: 1, unitPrice: product.sellPrice, customerName: '', notes: '' });
    setShowSaleModal(true);
  };

  const processSale = async () => {
    if (!selectedProduct || saleData.quantity === 0 || saleData.unitPrice === 0) return;
    
    // Check if there's enough stock
    if (selectedProduct.stock < saleData.quantity) {
      notifyWarning('Yetersiz stok! Mevcut stok: ' + selectedProduct.stock);
      return;
    }
    
    const totalAmount = saleData.quantity * saleData.unitPrice;
    const profit = saleData.quantity * (saleData.unitPrice - selectedProduct.buyPrice);
    
    const sale: Sale = {
      id: Date.now().toString(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: saleData.quantity,
      unitPrice: saleData.unitPrice,
      totalAmount,
      profit,
      date: dayjs().toISOString(),
      customerName: saleData.customerName,
      notes: saleData.notes
    };
    
    // Create stock movement for sale
    const stockMovement: StockMovement = {
      id: Date.now().toString() + '-movement',
      productId: selectedProduct.id,
      type: 'sale',
      quantity: saleData.quantity,
      reason: `Satış - ${saleData.customerName || 'Müşteri'}`,
      date: dayjs().toISOString(),
      salePrice: saleData.unitPrice,
      profit
    };

    // Update product stock
    const updatedProducts = products.map(product => {
      if (product.id === selectedProduct.id) {
        return {
          ...product,
          stock: product.stock - saleData.quantity,
          updatedAt: dayjs().toISOString()
        };
      }
      return product;
    });

    const updatedSales = [sale, ...sales];
    const updatedMovements = [stockMovement, ...stockMovements];
    
    setProducts(updatedProducts);
    setSales(updatedSales);
    setStockMovements(updatedMovements);
    
    // Save to Firebase
    const updatedProduct = updatedProducts.find(p => p.id === selectedProduct.id);
    if (updatedProduct) {
      await saveProduct(updatedProduct);
      await saveSale(sale);
      await saveStockMovement(stockMovement);
    }
    
    setShowSaleModal(false);
    setSelectedProduct(null);
    setSaleData({ quantity: 1, unitPrice: 0, customerName: '', notes: '' });
  };

  const getStockStatus = (product: Product) => {
    if (product.stock === 0) return { status: 'out', color: 'bg-red-500/20 text-red-300', text: 'Tükendi' };
    if (product.stock <= product.minStock) return { status: 'low', color: 'bg-yellow-500/20 text-yellow-300', text: 'Düşük' };
    return { status: 'normal', color: 'bg-green-500/20 text-green-300', text: 'Normal' };
  };

  const getProfit = (product: Product) => {
    return product.sellPrice - product.buyPrice;
  };

  const getProfitMargin = (product: Product) => {
    return ((product.sellPrice - product.buyPrice) / product.sellPrice * 100).toFixed(1);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'stock':
        return b.stock - a.stock;
      case 'price':
        return b.sellPrice - a.sellPrice;
      default:
        return 0;
    }
  });

  const getStats = () => {
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, product) => sum + (product.stock * product.sellPrice), 0);
    const lowStockCount = products.filter(product => product.stock <= product.minStock).length;
    const outOfStockCount = products.filter(product => product.stock === 0).length;
    const categories = Array.from(new Set(products.map(product => product.category)));

    return {
      totalProducts,
      totalValue,
      lowStockCount,
      outOfStockCount,
      categories: categories.length
    };
  };

  const stats = getStats();

  const menuItems = [
    { id: 'dashboard', name: 'Panel', icon: 'fa-chart-line' },
    { id: 'products', name: 'Ürünler', icon: 'fa-box' },
    { id: 'sales', name: 'Satışlar', icon: 'fa-shopping-cart' },
    { id: 'stock-movements', name: 'Stok Hareketleri', icon: 'fa-exchange-alt' },
    { id: 'reports', name: 'Raporlar', icon: 'fa-chart-bar' },
    { id: 'settings', name: 'Ayarlar', icon: 'fa-cog' }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-blue-500/20 via-transparent to-emerald-500/20 animate-aurora"></div>
      </div>

      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900/50 backdrop-blur-lg border-r border-white/10 flex flex-col">
          <div className="h-20 flex items-center justify-center px-4 border-b border-white/10">
            <div className="text-xl font-bold text-white flex items-center gap-3">
              <i className="fa-solid fa-warehouse text-blue-400"></i>
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                Stok Yönetimi
              </span>
            </div>
          </div>
          
          <nav className="flex-grow px-4 py-6 space-y-2">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as 'dashboard' | 'products' | 'sales' | 'stock-movements' | 'reports' | 'settings')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all duration-200 ${
                  currentView === item.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white hover:translate-x-1'
                }`}
              >
                <i className={`fa-solid ${item.icon} fa-fw`}></i>
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
          
          <div className="p-4 border-t border-white/10">
            <div className="text-sm text-gray-400">
              <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full text-xs">
                Çevrimiçi
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/10">
            <h1 className="text-2xl font-bold text-white">
              {menuItems.find(item => item.id === currentView)?.name}
            </h1>
            
            <div className="flex items-center gap-4">
              {(currentView === 'products' || currentView === 'dashboard') && (
                <button
                  onClick={() => setShowProductModal(true)}
                  className="primary-btn flex items-center gap-2"
                >
                  <i className="fa-solid fa-plus"></i>
                  Yeni Ürün
                </button>
              )}
              {currentView === 'sales' && (
                <button
                  onClick={() => setShowSaleModal(true)}
                  className="primary-btn flex items-center gap-2"
                >
                  <i className="fa-solid fa-shopping-cart"></i>
                  Yeni Satış
                </button>
              )}
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {/* Dashboard View */}
            {currentView === 'dashboard' && (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-box text-blue-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Toplam Ürün</p>
                        <p className="text-2xl font-bold text-white">{stats.totalProducts}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-lira-sign text-green-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Toplam Değer</p>
                        <p className="text-2xl font-bold text-white">{(stats.totalValue / 1000).toFixed(0)}K₺</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-exclamation-triangle text-yellow-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Düşük Stok</p>
                        <p className="text-2xl font-bold text-white">{stats.lowStockCount}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-times-circle text-red-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Tükenen</p>
                        <p className="text-2xl font-bold text-white">{stats.outOfStockCount}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-tags text-purple-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Kategori</p>
                        <p className="text-2xl font-bold text-white">{stats.categories}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Low Stock Alert */}
                {stats.lowStockCount > 0 && (
                  <div className="glass-card p-6 border-2 border-yellow-500/20">
                    <div className="flex items-center gap-4 mb-4">
                      <i className="fa-solid fa-exclamation-triangle text-yellow-400 text-2xl"></i>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Düşük Stok Uyarısı</h3>
                        <p className="text-gray-400">{stats.lowStockCount} ürünün stoku minimum seviyede veya altında</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {products.filter(product => product.stock <= product.minStock).slice(0, 5).map(product => (
                        <div key={product.id} className="flex items-center justify-between p-3 bg-yellow-500/10 rounded-lg">
                          <div>
                            <h4 className="font-medium text-white">{product.name}</h4>
                            <p className="text-sm text-gray-400">{product.brand} - {product.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-yellow-300">{product.stock} {product.unit}</p>
                            <p className="text-xs text-gray-500">Min: {product.minStock}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Products */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Son Eklenen Ürünler</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.slice(-6).reverse().map(product => {
                      const stockInfo = getStockStatus(product);
                      return (
                        <div key={product.id} className="bg-white/5 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium text-white text-sm">{product.name}</h4>
                              <p className="text-xs text-gray-400">{product.brand}</p>
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs ${stockInfo.color}`}>
                              {stockInfo.text}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-gray-400">Stok</p>
                              <p className="text-white font-medium">{product.stock} {product.unit}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Fiyat</p>
                              <p className="text-white font-medium">{product.sellPrice}₺</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Products View */}
            {currentView === 'products' && (
              <div className="space-y-6">
                {/* Filters and Search */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-64">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="form-input"
                      placeholder="Ürün, marka veya SKU ara..."
                    />
                  </div>
                  
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="form-input w-auto"
                  >
                    <option value="all">Tüm Kategoriler</option>
                    {Array.from(new Set(products.map(p => p.category))).map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'price')}
                    className="form-input w-auto"
                  >
                    <option value="name">İsme Göre</option>
                    <option value="stock">Stoka Göre</option>
                    <option value="price">Fiyata Göre</option>
                  </select>
                </div>

                {/* Products Table */}
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-white/10">
                        <tr className="text-left">
                          <th className="p-4 text-gray-400 font-medium">Ürün</th>
                          <th className="p-4 text-gray-400 font-medium">Kategori</th>
                          <th className="p-4 text-gray-400 font-medium">Stok</th>
                          <th className="p-4 text-gray-400 font-medium">Alış Fiyatı</th>
                          <th className="p-4 text-gray-400 font-medium">Satış Fiyatı</th>
                          <th className="p-4 text-gray-400 font-medium">Kar</th>
                          <th className="p-4 text-gray-400 font-medium">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map(product => {
                          const stockInfo = getStockStatus(product);
                          return (
                            <tr key={product.id} className="border-b border-white/5 hover:bg-white/5">
                              <td className="p-4">
                                <div>
                                  <h4 className="font-medium text-white">{product.name}</h4>
                                  <p className="text-sm text-gray-400">{product.brand} - {product.sku}</p>
                                </div>
                              </td>
                              <td className="p-4 text-gray-300">{product.category}</td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-white">{product.stock} {product.unit}</span>
                                  <div className={`px-2 py-1 rounded-full text-xs ${stockInfo.color}`}>
                                    {stockInfo.text}
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 text-gray-300">{product.buyPrice}₺</td>
                              <td className="p-4 text-white font-medium">{product.sellPrice}₺</td>
                              <td className="p-4">
                                <div>
                                  <span className="text-green-400 font-medium">{getProfit(product)}₺</span>
                                  <span className="text-xs text-gray-400 ml-1">(%{getProfitMargin(product)})</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openSaleModal(product)}
                                    className="text-green-400 hover:text-green-300"
                                    title="Sat"
                                    disabled={product.stock === 0}
                                  >
                                    <i className="fa-solid fa-shopping-cart"></i>
                                  </button>
                                  <button
                                    onClick={() => openStockModal(product)}
                                    className="text-blue-400 hover:text-blue-300"
                                    title="Stok Güncelle"
                                  >
                                    <i className="fa-solid fa-boxes"></i>
                                  </button>
                                  <button
                                    onClick={() => openEditModal(product)}
                                    className="text-gray-400 hover:text-white"
                                    title="Düzenle"
                                  >
                                    <i className="fa-solid fa-edit"></i>
                                  </button>
                                  <button
                                    onClick={() => deleteProduct(product.id)}
                                    className="text-red-400 hover:text-red-300"
                                    title="Sil"
                                  >
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Sales View */}
            {currentView === 'sales' && (
              <div className="space-y-6">
                {/* Sales Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-shopping-cart text-green-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Toplam Satış</p>
                        <p className="text-2xl font-bold text-white">{sales.length}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-lira-sign text-blue-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Toplam Ciro</p>
                        <p className="text-2xl font-bold text-white">{(sales.reduce((sum, sale) => sum + sale.totalAmount, 0) / 1000).toFixed(0)}K₺</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-chart-line text-emerald-400 text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Toplam Kar</p>
                        <p className="text-2xl font-bold text-white">{(sales.reduce((sum, sale) => sum + sale.profit, 0) / 1000).toFixed(0)}K₺</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sales List */}
                <div className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-white/10">
                    <h3 className="text-lg font-semibold text-white">Son Satışlar</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-white/10">
                        <tr className="text-left">
                          <th className="p-4 text-gray-400 font-medium">Ürün</th>
                          <th className="p-4 text-gray-400 font-medium">Müşteri</th>
                          <th className="p-4 text-gray-400 font-medium">Miktar</th>
                          <th className="p-4 text-gray-400 font-medium">Birim Fiyat</th>
                          <th className="p-4 text-gray-400 font-medium">Toplam</th>
                          <th className="p-4 text-gray-400 font-medium">Kar</th>
                          <th className="p-4 text-gray-400 font-medium">Tarih</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map(sale => (
                          <tr key={sale.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="p-4">
                              <div>
                                <h4 className="font-medium text-white">{sale.productName}</h4>
                              </div>
                            </td>
                            <td className="p-4 text-gray-300">{sale.customerName || 'Müşteri'}</td>
                            <td className="p-4 text-gray-300">{sale.quantity}</td>
                            <td className="p-4 text-gray-300">{sale.unitPrice}₺</td>
                            <td className="p-4 text-white font-medium">{sale.totalAmount}₺</td>
                            <td className="p-4">
                              <span className="text-green-400 font-medium">{sale.profit.toFixed(2)}₺</span>
                            </td>
                            <td className="p-4 text-gray-400 text-sm">{dayjs(sale.date).format('DD/MM/YYYY HH:mm')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sales.length === 0 && (
                      <div className="p-8 text-center text-gray-500">
                        Henüz satış kaydı bulunmuyor
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Stock Movements View */}
            {currentView === 'stock-movements' && (
              <div className="space-y-6">
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Son Stok Hareketleri</h3>
                  <div className="space-y-4">
                    {stockMovements.slice(0, 10).map(movement => {
                      const product = products.find(p => p.id === movement.productId);
                      return (
                        <div key={movement.id} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              movement.type === 'in' ? 'bg-green-500/20' :
                              movement.type === 'out' ? 'bg-red-500/20' :
                              movement.type === 'sale' ? 'bg-emerald-500/20' :
                              'bg-yellow-500/20'
                            }`}>
                              <i className={`fa-solid ${
                                movement.type === 'in' ? 'fa-arrow-down text-green-400' :
                                movement.type === 'out' ? 'fa-arrow-up text-red-400' :
                                movement.type === 'sale' ? 'fa-shopping-cart text-emerald-400' :
                                'fa-edit text-yellow-400'
                              }`}></i>
                            </div>
                            <div>
                              <h4 className="font-medium text-white">{product?.name}</h4>
                              <p className="text-sm text-gray-400">{movement.reason}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${
                              movement.type === 'in' ? 'text-green-400' :
                              movement.type === 'out' ? 'text-red-400' :
                              movement.type === 'sale' ? 'text-emerald-400' :
                              'text-yellow-400'
                            }`}>
                              {movement.type === 'in' ? '+' : movement.type === 'out' || movement.type === 'sale' ? '-' : ''}{Math.abs(movement.quantity)}
                              {movement.type === 'sale' && movement.salePrice && (
                                <span className="text-xs text-gray-400 ml-1">({movement.salePrice}₺)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{dayjs(movement.date).format('DD/MM/YYYY HH:mm')}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Reports View */}
            {currentView === 'reports' && (
              <div className="space-y-6">
                {/* Monthly Reports */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-calendar-month text-blue-400 text-xl"></i>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Bu Ay</h3>
                        <p className="text-sm text-gray-400">Aylık performans</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Satış Adedi:</span>
                        <span className="text-white font-medium">{sales.filter(s => new Date(s.date).getMonth() === new Date().getMonth()).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Toplam Ciro:</span>
                        <span className="text-white font-medium">
                          {(sales.filter(s => new Date(s.date).getMonth() === new Date().getMonth()).reduce((sum, sale) => sum + sale.totalAmount, 0)).toLocaleString('tr-TR')}₺
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Toplam Kar:</span>
                        <span className="text-green-400 font-medium">
                          {(sales.filter(s => new Date(s.date).getMonth() === new Date().getMonth()).reduce((sum, sale) => sum + sale.profit, 0)).toLocaleString('tr-TR')}₺
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-trending-up text-green-400 text-xl"></i>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">En Çok Satan</h3>
                        <p className="text-sm text-gray-400">Ürün kategorileri</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {Array.from(new Set(products.map(p => p.category))).slice(0, 3).map(category => {
                        const categoryProducts = products.filter(p => p.category === category);
                        const totalSold = sales.filter(s => categoryProducts.some(p => p.name === s.productName)).reduce((sum, s) => sum + s.quantity, 0);
                        return (
                          <div key={category} className="flex justify-between">
                            <span className="text-gray-400">{category}:</span>
                            <span className="text-white font-medium">{totalSold} adet</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="glass-card p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-exclamation-triangle text-orange-400 text-xl"></i>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Stok Uyarıları</h3>
                        <p className="text-sm text-gray-400">Kritik seviye</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Düşük Stok:</span>
                        <span className="text-yellow-400 font-medium">{stats.lowStockCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Tükenen:</span>
                        <span className="text-red-400 font-medium">{stats.outOfStockCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Settings View */}
            {currentView === 'settings' && (
              <div className="space-y-6">
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Genel Ayarlar</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Varsayılan Birim</label>
                      <select className="form-input w-auto">
                        <option value="adet">Adet</option>
                        <option value="kg">Kilogram</option>
                        <option value="lt">Litre</option>
                        <option value="m">Metre</option>
                        <option value="paket">Paket</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Minimum Stok Uyarısı</label>
                      <input type="checkbox" className="mr-2" defaultChecked />
                      <span className="text-sm text-gray-400">Stok düşük olduğunda bildirim gönder</span>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Veri Yönetimi</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-400 mb-2">Toplam {products.length} ürün, {sales.length} satış kaydı</p>
                    </div>
                    <div className="flex gap-3">
                      <button className="secondary-btn">Verileri Dışa Aktar</button>
                      <button className="secondary-btn">Yedek Al</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              {selectedProduct ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Ürün Adı *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                  placeholder="Ürün adını girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Marka</label>
                <input
                  type="text"
                  value={formData.brand || ''}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="form-input"
                  placeholder="Marka adını girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kategori</label>
                <input
                  type="text"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="form-input"
                  placeholder="Kategori girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SKU</label>
                <input
                  type="text"
                  value={formData.sku || ''}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="form-input"
                  placeholder="SKU kodu girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Alış Fiyatı *</label>
                <input
                  type="number"
                  value={formData.buyPrice || ''}
                  onChange={(e) => setFormData({ ...formData, buyPrice: parseFloat(e.target.value) || 0 })}
                  className="form-input"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Satış Fiyatı *</label>
                <input
                  type="number"
                  value={formData.sellPrice || ''}
                  onChange={(e) => setFormData({ ...formData, sellPrice: parseFloat(e.target.value) || 0 })}
                  className="form-input"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Stok Miktarı</label>
                <input
                  type="number"
                  value={formData.stock || ''}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  placeholder="0"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Minimum Stok</label>
                <input
                  type="number"
                  value={formData.minStock || ''}
                  onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  placeholder="0"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Birim</label>
                <select
                  value={formData.unit || 'adet'}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="form-input"
                >
                  <option value="adet">Adet</option>
                  <option value="kg">Kilogram</option>
                  <option value="lt">Litre</option>
                  <option value="m">Metre</option>
                  <option value="paket">Paket</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tedarikçi</label>
                <input
                  type="text"
                  value={formData.supplier || ''}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="form-input"
                  placeholder="Tedarikçi adını girin"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Açıklama</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-input"
                  rows={3}
                  placeholder="Ürün açıklamasını girin"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={selectedProduct ? updateProduct : addProduct}
                disabled={!formData.name || !formData.buyPrice || !formData.sellPrice}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedProduct ? 'Güncelle' : 'Ürün Ekle'}
              </button>
              
              <button
                onClick={() => {
                  setShowProductModal(false);
                  setSelectedProduct(null);
                  setFormData({});
                }}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Modal */}
      {showStockModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Stok Güncelle</h3>
            <p className="text-gray-400 mb-4">{selectedProduct.name}</p>
            <p className="text-sm text-gray-500 mb-4">Mevcut Stok: {selectedProduct.stock} {selectedProduct.unit}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">İşlem Türü</label>
                <select
                  value={stockData.type}
                  onChange={(e) => setStockData({ ...stockData, type: e.target.value as 'in' | 'out' | 'adjustment' })}
                  className="form-input"
                >
                  <option value="in">Stok Girişi</option>
                  <option value="out">Stok Çıkışı</option>
                  <option value="adjustment">Düzeltme</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Miktar ({selectedProduct.unit})
                </label>
                <input
                  type="number"
                  value={stockData.quantity}
                  onChange={(e) => setStockData({ ...stockData, quantity: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  placeholder="0"
                  min="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Sebep</label>
                <input
                  type="text"
                  value={stockData.reason}
                  onChange={(e) => setStockData({ ...stockData, reason: e.target.value })}
                  className="form-input"
                  placeholder="İşlem sebebini girin"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={updateStock}
                disabled={stockData.quantity === 0 || !stockData.reason}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Güncelle
              </button>
              
              <button
                onClick={() => {
                  setShowStockModal(false);
                  setSelectedProduct(null);
                  setStockData({ quantity: 0, reason: '', type: 'in' });
                }}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Modal */}
      {showSaleModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Satış Yap</h3>
            <p className="text-gray-400 mb-2">{selectedProduct.name}</p>
            <p className="text-sm text-gray-500 mb-4">Mevcut Stok: {selectedProduct.stock} {selectedProduct.unit}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Satış Miktarı ({selectedProduct.unit})
                </label>
                <input
                  type="number"
                  value={saleData.quantity}
                  onChange={(e) => setSaleData({ ...saleData, quantity: parseInt(e.target.value) || 1 })}
                  className="form-input"
                  placeholder="1"
                  min="1"
                  max={selectedProduct.stock}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Birim Satış Fiyatı (₺)</label>
                <input
                  type="number"
                  value={saleData.unitPrice}
                  onChange={(e) => setSaleData({ ...saleData, unitPrice: parseFloat(e.target.value) || 0 })}
                  className="form-input"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Önerilen fiyat: {selectedProduct.sellPrice}₺
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Müşteri Adı (İsteğe Bağlı)</label>
                <input
                  type="text"
                  value={saleData.customerName}
                  onChange={(e) => setSaleData({ ...saleData, customerName: e.target.value })}
                  className="form-input"
                  placeholder="Müşteri adı"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notlar (İsteğe Bağlı)</label>
                <textarea
                  value={saleData.notes}
                  onChange={(e) => setSaleData({ ...saleData, notes: e.target.value })}
                  className="form-input"
                  rows={2}
                  placeholder="Satış notları"
                />
              </div>
              
              {saleData.quantity > 0 && saleData.unitPrice > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Toplam Tutar:</span>
                    <span className="text-white font-medium">{(saleData.quantity * saleData.unitPrice).toFixed(2)}₺</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Kar:</span>
                    <span className="text-green-400 font-medium">
                      {(saleData.quantity * (saleData.unitPrice - selectedProduct.buyPrice)).toFixed(2)}₺
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={processSale}
                disabled={saleData.quantity === 0 || saleData.unitPrice === 0 || saleData.quantity > selectedProduct.stock}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Satışı Tamamla
              </button>
              
              <button
                onClick={() => {
                  setShowSaleModal(false);
                  setSelectedProduct(null);
                  setSaleData({ quantity: 1, unitPrice: 0, customerName: '', notes: '' });
                }}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
        .primary-btn {
          background-color: #2563eb;
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: background-color 0.2s;
        }
        .primary-btn:hover {
          background-color: #1d4ed8;
        }
        .secondary-btn {
          background-color: #4b5563;
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: background-color 0.2s;
        }
        .secondary-btn:hover {
          background-color: #374151;
        }
        .glass-card {
          background: rgba(17, 24, 39, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 1.5rem;
        }
        .form-input {
          background-color: rgba(31, 41, 55, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e5e7eb;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          transition: all 0.3s ease;
          width: 100%;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
        }
        .aurora-bg {
          animation: moveAurora 25s alternate infinite ease-in-out;
        }
        @keyframes moveAurora {
          0% { transform: translate(-20%, -20%) rotate(0deg); }
          100% { transform: translate(20%, 20%) rotate(180deg); }
        }
        `}
      </style>
    </div>
  );
};

export default FiyatListesi;