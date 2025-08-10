import React, { useState, useEffect, useCallback } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, onSnapshot, query, orderBy, writeBatch, getDocs, where } from 'firebase/firestore';
import * as yup from 'yup';
import FormInput from './form/FormInput';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';

interface Product {
  id: string;
  name: string;
  buyPrice: number;  // Alış fiyatı
  sellPrice: number; // Satış fiyatı
  quantity: number;
  createdAt: any;
  updatedAt: any;
}

interface Transaction {
  id: string;
  buyerName: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    buyPrice: number;
    sellPrice: number;
  }[];
  totalAmount: number;
  totalProfit: number; // Kar
  createdAt: any;
}

interface CartItem {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
}

const Stok: React.FC = () => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'satis' | 'stok' | 'gecmis'>('satis');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [buyerName, setBuyerName] = useState('');
  
  // Modals
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAddToCartModal, setShowAddToCartModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Form states
  const [bulkItems, setBulkItems] = useState([{ name: '', quantity: 1, buyPrice: 0, sellPrice: 0 }]);
  const [bulkErrors, setBulkErrors] = useState<{ name?: string; quantity?: string; buyPrice?: string; sellPrice?: string }[]>([{}]);
  const [stockAmount, setStockAmount] = useState(1);
  const [cartQuantity, setCartQuantity] = useState(1);

  const bulkSchema = yup.array().of(
    yup.object().shape({
      name: yup.string().required('Ürün adı gerekli'),
      quantity: yup
        .number()
        .typeError('Adet sayı olmalı')
        .integer('Adet tam sayı olmalı')
        .positive('Adet 0 dan büyük olmalı')
        .required('Adet gerekli'),
      buyPrice: yup
        .number()
        .typeError('Alış fiyatı gerekli')
        .positive('Alış fiyatı 0 dan büyük olmalı')
        .required('Alış fiyatı gerekli'),
      sellPrice: yup
        .number()
        .typeError('Satış fiyatı gerekli')
        .positive('Satış fiyatı 0 dan büyük olmalı')
        .required('Satış fiyatı gerekli')
    })
  );

  // Load data from Firebase
  const loadData = useCallback(() => {
    if (!user) return;
    
    const uid = user.uid;
    
    // Products listener
    const productsQuery = query(
      collection(db, 'userData', uid, 'products'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const productsList: Product[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Eski verileri destekle - price alanı varsa sellPrice olarak kullan
        const product: Product = {
          id: doc.id,
          name: data.name,
          buyPrice: data.buyPrice || 0,
          sellPrice: data.sellPrice || data.price || 0, // Eski price alanını sellPrice olarak kullan
          quantity: data.quantity || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
        productsList.push(product);
      });
      setProducts(productsList);
    });

    // Transactions listener
    const transactionsQuery = query(
      collection(db, 'userData', uid, 'transactions'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsList: Transaction[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Eski verileri destekle
        const transaction: Transaction = {
          id: doc.id,
          buyerName: data.buyerName,
          items: (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            buyPrice: item.buyPrice || 0,
            sellPrice: item.sellPrice || item.price || 0 // Eski price alanını sellPrice olarak kullan
          })),
          totalAmount: data.totalAmount || 0,
          totalProfit: data.totalProfit || 0,
          createdAt: data.createdAt
        };
        transactionsList.push(transaction);
      });
      setTransactions(transactionsList);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeTransactions();
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      const unsubscribe = loadData();
      return unsubscribe;
    }
  }, [user, loadData]);

  // Add multiple products/stock
  const handleBulkAdd = async () => {
    if (!user) return;

    try {
      await bulkSchema.validate(bulkItems, { abortEarly: false });
      const batch = writeBatch(db);
      const productsRef = collection(db, 'userData', user.uid, 'products');

      for (const item of bulkItems) {
        // Check if product exists
        const existingQuery = query(productsRef, where('name', '==', item.name.trim()));
        const existingSnapshot = await getDocs(existingQuery);

        if (!existingSnapshot.empty) {
          // Product exists, update quantity and prices
          const existingDoc = existingSnapshot.docs[0];
          const currentQuantity = existingDoc.data().quantity || 0;
          batch.update(existingDoc.ref, {
            quantity: currentQuantity + item.quantity,
            buyPrice: item.buyPrice,
            sellPrice: item.sellPrice,
            updatedAt: serverTimestamp()
          });
        } else {
          // New product
          const newProductRef = doc(productsRef);
          batch.set(newProductRef, {
            name: item.name.trim(),
            buyPrice: item.buyPrice,
            sellPrice: item.sellPrice,
            quantity: item.quantity,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      setShowBulkAddModal(false);
      setBulkItems([{ name: '', quantity: 1, buyPrice: 0, sellPrice: 0 }]);
      setBulkErrors([{}]);
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const errors = bulkItems.map(() => ({}) as { name?: string; quantity?: string; buyPrice?: string; sellPrice?: string });
        error.inner.forEach((e) => {
          const match = e.path?.match(/\[(\d+)\]\.(.*)/) || e.path?.match(/(\d+)\.(.*)/);
          if (match) {
            const index = parseInt(match[1], 10);
            const field = match[2] as keyof typeof errors[0];
            errors[index][field] = e.message;
          }
        });
        setBulkErrors(errors);
      } else {
        console.error('Bulk add error:', error);
        alert('Ürünler eklenirken bir hata oluştu.');
      }
    }
  };

  // Add stock to existing product
  const handleAddStock = async () => {
    if (!selectedProduct || !user || stockAmount <= 0) return;
    
    try {
      const productRef = doc(db, 'userData', user.uid, 'products', selectedProduct.id);
      await updateDoc(productRef, {
        quantity: selectedProduct.quantity + stockAmount,
        updatedAt: serverTimestamp()
      });
      
      setShowAddStockModal(false);
      setSelectedProduct(null);
      setStockAmount(1);
    } catch (error) {
      console.error('Add stock error:', error);
      alert('Stok eklenirken bir hata oluştu.');
    }
  };

  // Add to cart
  const handleAddToCart = () => {
    if (!selectedProduct || cartQuantity <= 0 || cartQuantity > selectedProduct.quantity) return;
    
    const existingItem = cart.find(item => item.id === selectedProduct.id);
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + cartQuantity;
      if (newQuantity > selectedProduct.quantity) {
        alert('Stokta yeterli ürün yok!');
        return;
      }
      setCart(cart.map(item => 
        item.id === selectedProduct.id 
          ? { ...item, quantity: newQuantity }
          : item
      ));
    } else {
      setCart([...cart, {
        id: selectedProduct.id,
        name: selectedProduct.name,
        buyPrice: selectedProduct.buyPrice,
        sellPrice: selectedProduct.sellPrice,
        quantity: cartQuantity
      }]);
    }
    
    setShowAddToCartModal(false);
    setSelectedProduct(null);
    setCartQuantity(1);
  };

  // Remove from cart
  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  // Complete sale
  const handleSale = async () => {
    if (!user || cart.length === 0 || !buyerName.trim()) {
      alert('Lütfen alıcı adını girin ve sepete ürün ekleyin.');
      return;
    }
    
    try {
      const batch = writeBatch(db);
      const productsRef = collection(db, 'userData', user.uid, 'products');
      
      // Update product quantities
      for (const cartItem of cart) {
        const productRef = doc(productsRef, cartItem.id);
        const product = products.find(p => p.id === cartItem.id);
        if (product) {
          const newQuantity = product.quantity - cartItem.quantity;
          if (newQuantity <= 0) {
            batch.delete(productRef);
          } else {
            batch.update(productRef, {
              quantity: newQuantity,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
      
      // Add transaction
      const transactionsRef = collection(db, 'userData', user.uid, 'transactions');
      const totalAmount = cart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);
      const totalProfit = cart.reduce((sum, item) => sum + ((item.sellPrice - item.buyPrice) * item.quantity), 0);
      
      const transactionRef = doc(transactionsRef);
      batch.set(transactionRef, {
        buyerName: buyerName.trim(),
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          buyPrice: item.buyPrice,
          sellPrice: item.sellPrice
        })),
        totalAmount,
        totalProfit,
        createdAt: serverTimestamp()
      });
      
      await batch.commit();
      
      // Clear cart and buyer name
      setCart([]);
      setBuyerName('');
      alert('Satış başarıyla tamamlandı!');
    } catch (error) {
      console.error('Sale error:', error);
      alert('Satış tamamlanırken bir hata oluştu.');
    }
  };

  // Delete product
  const deleteProduct = async (productId: string) => {
    if (!user || !window.confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return;
    
    try {
      await deleteDoc(doc(db, 'userData', user.uid, 'products', productId));
    } catch (error) {
      console.error('Delete product error:', error);
      alert('Ürün silinirken bir hata oluştu.');
    }
  };

  // Delete transaction and restore stock
  const deleteTransaction = async (transactionId: string) => {
    if (!user || !window.confirm('Bu işlemi silmek ve stokları geri yüklemek istediğinizden emin misiniz?')) return;
    
    try {
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;
      
      const batch = writeBatch(db);
      const productsRef = collection(db, 'userData', user.uid, 'products');
      
      // Restore stock for each sold item
      for (const soldItem of transaction.items) {
        const existingQuery = query(productsRef, where('name', '==', soldItem.name));
        const existingSnapshot = await getDocs(existingQuery);
        
        if (!existingSnapshot.empty) {
          // Product exists, add back quantity
          const existingDoc = existingSnapshot.docs[0];
          const currentQuantity = existingDoc.data().quantity || 0;
          batch.update(existingDoc.ref, {
            quantity: currentQuantity + soldItem.quantity,
            updatedAt: serverTimestamp()
          });
        } else {
          // Product doesn't exist, create it
          const newProductRef = doc(productsRef);
          batch.set(newProductRef, {
            name: soldItem.name,
            buyPrice: soldItem.buyPrice,
            sellPrice: soldItem.sellPrice,
            quantity: soldItem.quantity,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
      
      // Delete transaction
      const transactionRef = doc(db, 'userData', user.uid, 'transactions', transactionId);
      batch.delete(transactionRef);
      
      await batch.commit();
      alert('İşlem silindi ve stoklar geri yüklendi.');
    } catch (error) {
      console.error('Delete transaction error:', error);
      alert('İşlem silinirken bir hata oluştu.');
    }
  };

  const formatCurrency = (value: number) => {
    return (value || 0).toFixed(2).replace('.', ',') + ' ₺';
  };

  const getTotalValue = () => {
    return products.reduce((sum, product) => sum + (product.buyPrice * product.quantity), 0);
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);
  };

  const getCartProfit = () => {
    return cart.reduce((sum, item) => sum + ((item.sellPrice - item.buyPrice) * item.quantity), 0);
  };

  const menuItems = [
    { id: 'satis', name: 'Satış Paneli', icon: 'fa-cash-register' },
    { id: 'stok', name: 'Stok Yönetimi', icon: 'fa-boxes-stacked' },
    { id: 'gecmis', name: 'Geçmiş İşlemler', icon: 'fa-history' }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-blue-500/20 via-transparent to-cyan-500/20 animate-aurora"></div>
      </div>

      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900/50 backdrop-blur-lg border-r border-white/10 flex flex-col">
          <div className="h-20 flex items-center justify-center px-4 border-b border-white/10">
            <div className="text-xl font-bold text-white flex items-center gap-3">
              <i className="fa-solid fa-warehouse text-blue-400"></i>
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Stok Portalı
              </span>
            </div>
          </div>
          
          <nav className="flex-grow px-4 py-6 space-y-2">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as 'satis' | 'stok' | 'gecmis')}
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
            <div className="text-sm">
              <p className="font-semibold text-white truncate">{user?.email}</p>
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
              {currentView === 'stok' && (
                <button
                  onClick={() => setShowBulkAddModal(true)}
                  className="primary-btn flex items-center gap-2"
                >
                  <i className="fa-solid fa-plus"></i>
                  Ürün/Stok Ekle
                </button>
              )}
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-8">
            {/* Satış Paneli View */}
            {currentView === 'satis' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                {/* Products List */}
                <div className="lg:col-span-2 glass-card p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                      <i className="fa-solid fa-boxes-stacked text-blue-400"></i>
                      Mevcut Ürünler
                    </h2>
                    <div className="text-lg font-semibold text-blue-400">
                      Toplam: {formatCurrency(getTotalValue())}
                    </div>
                  </div>
                  
                  <div className="overflow-y-auto flex-grow space-y-4">
                    {products.length === 0 ? (
                      <p className="text-center py-10 text-gray-400">Henüz ürün eklenmemiş.</p>
                    ) : (
                      products.map(product => (
                        <div key={product.id} className="bg-black/20 p-4 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className="font-bold text-lg text-gray-200">{product.name}</h3>
                              <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                                <div>
                                  <p className="text-gray-400">Stok</p>
                                  <p className="font-semibold">
                                    {product.quantity <= 0 ? 
                                      <span className="text-red-400">Tükendi</span> : 
                                      product.quantity
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Satış Fiyatı</p>
                                  <p className="font-semibold">{formatCurrency(product.sellPrice)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Toplam Değer</p>
                                  <p className="font-semibold text-blue-400">
                                    {formatCurrency(product.sellPrice * product.quantity)}
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setShowAddStockModal(true);
                                }}
                                className="w-8 h-8 flex items-center justify-center bg-green-500/80 hover:bg-green-500 text-white rounded-md transition"
                                title="Stok Ekle"
                              >
                                <i className="fa-solid fa-plus"></i>
                              </button>
                              
                              <button
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setShowAddToCartModal(true);
                                }}
                                disabled={product.quantity <= 0}
                                className="w-8 h-8 flex items-center justify-center bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Sepete Ekle"
                              >
                                <i className="fa-solid fa-cart-plus"></i>
                              </button>
                              
                              <button
                                onClick={() => deleteProduct(product.id)}
                                className="w-8 h-8 flex items-center justify-center bg-red-500/80 hover:bg-red-500 text-white rounded-md transition"
                                title="Sil"
                              >
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Shopping Cart */}
                <div className="lg:col-span-1 glass-card p-6 flex flex-col">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <i className="fa-solid fa-shopping-cart text-emerald-400"></i>
                    Alışveriş Sepeti
                  </h2>
                  
                  <div className="overflow-y-auto flex-grow">
                    {cart.length === 0 ? (
                      <p className="text-center text-gray-400 py-4">Sepetiniz boş.</p>
                    ) : (
                      <div className="space-y-2">
                        {cart.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                            <div className="flex-1">
                              <p className="text-white text-sm font-medium">{item.name}</p>
                              <p className="text-gray-400 text-xs">
                                {item.quantity} x {formatCurrency(item.sellPrice)}
                              </p>
                              <p className="text-green-400 text-xs">
                                Kar: {formatCurrency((item.sellPrice - item.buyPrice) * item.quantity)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-400 font-semibold">
                                {formatCurrency(item.sellPrice * item.quantity)}
                              </span>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-300 hover:bg-red-500/40 rounded transition"
                              >
                                <i className="fa-solid fa-times text-xs"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t border-white/10 pt-4 mt-4">
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-300">Sepet Toplamı:</span>
                        <span className="font-bold text-xl text-emerald-400">
                          {formatCurrency(getCartTotal())}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-green-300">Toplam Kar:</span>
                        <span className="font-bold text-lg text-green-400">
                          {formatCurrency(getCartProfit())}
                        </span>
                      </div>
                    </div>
                    
                    <input
                      type="text"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Alıcı Adı Girin..."
                      className="form-input mb-3"
                    />
                    
                    <button
                      onClick={handleSale}
                      disabled={cart.length === 0 || !buyerName.trim()}
                      className="w-full primary-btn !bg-emerald-500 hover:!bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="fa-solid fa-cash-register mr-2"></i>
                      Satışı Tamamla
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stok Yönetimi View */}
            {currentView === 'stok' && (
              <div className="space-y-6">
                <div className="glass-card p-6">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <i className="fa-solid fa-boxes-stacked text-purple-400"></i>
                    Stok Durumu
                  </h2>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-2 text-gray-400">Ürün Adı</th>
                          <th className="text-center py-3 px-2 text-gray-400">Stok</th>
                          <th className="text-center py-3 px-2 text-gray-400">Alış Fiyatı</th>
                          <th className="text-center py-3 px-2 text-gray-400">Satış Fiyatı</th>
                          <th className="text-center py-3 px-2 text-gray-400">Kar Marjı</th>
                          <th className="text-center py-3 px-2 text-gray-400">Toplam Değer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-gray-400">
                              Henüz ürün eklenmemiş.
                            </td>
                          </tr>
                        ) : (
                          products.map(product => {
                            const margin = ((product.sellPrice - product.buyPrice) / product.buyPrice * 100) || 0;
                            const totalValue = product.buyPrice * product.quantity;
                            
                            return (
                              <tr key={product.id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="py-3 px-2 font-medium text-white">{product.name}</td>
                                <td className="py-3 px-2 text-center">
                                  <span className={`font-semibold ${product.quantity <= 0 ? 'text-red-400' : 'text-white'}`}>
                                    {product.quantity <= 0 ? 'Tükendi' : product.quantity}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center text-blue-400">
                                  {formatCurrency(product.buyPrice)}
                                </td>
                                <td className="py-3 px-2 text-center text-emerald-400">
                                  {formatCurrency(product.sellPrice)}
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <span className={`font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    %{margin.toFixed(1)}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center text-purple-400 font-semibold">
                                  {formatCurrency(totalValue)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {products.length > 0 && (
                        <tfoot className="border-t border-white/10">
                          <tr>
                            <td colSpan={5} className="py-3 px-2 text-right font-semibold text-gray-300">
                              TOPLAM STOK DEĞERİ:
                            </td>
                            <td className="py-3 px-2 text-center font-bold text-xl text-purple-400">
                              {formatCurrency(getTotalValue())}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Düşük Stok Uyarıları */}
                {products.filter(p => p.quantity <= 5 && p.quantity > 0).length > 0 && (
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
                      <i className="fa-solid fa-exclamation-triangle"></i>
                      Düşük Stok Uyarısı
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {products
                        .filter(p => p.quantity <= 5 && p.quantity > 0)
                        .map(product => (
                          <div key={product.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                            <h4 className="font-semibold text-white">{product.name}</h4>
                            <p className="text-yellow-400 text-sm">Kalan: {product.quantity} adet</p>
                            <button
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowAddStockModal(true);
                              }}
                              className="mt-2 text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded hover:bg-yellow-500/30 transition-colors"
                            >
                              Stok Ekle
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Geçmiş İşlemler View */}
            {currentView === 'gecmis' && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                  <i className="fa-solid fa-history text-cyan-400"></i>
                  Geçmiş İşlemler
                </h2>
                
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {transactions.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">Henüz işlem yapılmamış.</p>
                  ) : (
                    transactions.map(transaction => (
                      <div key={transaction.id} className="bg-black/20 p-4 rounded-xl border border-white/10">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-gray-200">{transaction.buyerName}</span>
                            <span className="text-xs text-gray-400 ml-2">
                              {transaction.createdAt?.toDate().toLocaleString('tr-TR')}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-bold text-cyan-400">
                                {formatCurrency(transaction.totalAmount)}
                              </div>
                              <div className="text-green-400 text-sm">
                                Kar: {formatCurrency(transaction.totalProfit || 0)}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteTransaction(transaction.id)}
                              className="text-red-500/70 hover:text-red-500 transition-colors w-8 h-8 flex items-center justify-center"
                              title="İşlemi Sil"
                            >
                              <i className="fa-solid fa-trash-alt"></i>
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <h4 className="text-sm font-semibold text-gray-400 mb-2">Satılan Ürünler</h4>
                          <div className="space-y-1">
                            {transaction.items.map((item, index) => (
                              <div key={index} className="flex justify-between items-center text-sm">
                                <span className="text-gray-300">
                                  {item.name} <span className="text-gray-500">x {item.quantity}</span>
                                </span>
                                <div className="text-right">
                                  <div className="text-gray-400">
                                    {formatCurrency((item.sellPrice || item.buyPrice || 0) * item.quantity)}
                                  </div>
                                  <div className="text-green-400 text-xs">
                                    Kar: {formatCurrency(((item.sellPrice || 0) - (item.buyPrice || 0)) * item.quantity)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bulk Add Modal */}
      {showBulkAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-2xl p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-white">Toplu Ürün/Stok Ekle</h3>
              <button 
                onClick={() => setShowBulkAddModal(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto mb-4">
              {bulkItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 mb-3 items-center">
                  <FormInput
                    value={item.name}
                    onChange={(e) => {
                      const newItems = [...bulkItems];
                      newItems[index].name = e.target.value;
                      setBulkItems(newItems);
                      const newErrors = [...bulkErrors];
                      if (newErrors[index]?.name) newErrors[index].name = undefined;
                      setBulkErrors(newErrors);
                    }}
                    placeholder="Ürün Adı"
                    containerClassName="col-span-4"
                    className="text-sm"
                    error={bulkErrors[index]?.name}
                  />
                  <FormInput
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...bulkItems];
                      newItems[index].quantity = parseInt(e.target.value) || 1;
                      setBulkItems(newItems);
                      const newErrors = [...bulkErrors];
                      if (newErrors[index]?.quantity) newErrors[index].quantity = undefined;
                      setBulkErrors(newErrors);
                    }}
                    placeholder="Adet"
                    min="1"
                    containerClassName="col-span-1"
                    className="text-sm"
                    error={bulkErrors[index]?.quantity}
                  />
                  <FormInput
                    type="number"
                    value={item.buyPrice}
                    onChange={(e) => {
                      const newItems = [...bulkItems];
                      newItems[index].buyPrice = parseFloat(e.target.value) || 0;
                      setBulkItems(newItems);
                      const newErrors = [...bulkErrors];
                      if (newErrors[index]?.buyPrice) newErrors[index].buyPrice = undefined;
                      setBulkErrors(newErrors);
                    }}
                    placeholder="Alış ₺"
                    min="0"
                    step="0.01"
                    containerClassName="col-span-2"
                    className="text-sm"
                    error={bulkErrors[index]?.buyPrice}
                  />
                  <FormInput
                    type="number"
                    value={item.sellPrice}
                    onChange={(e) => {
                      const newItems = [...bulkItems];
                      newItems[index].sellPrice = parseFloat(e.target.value) || 0;
                      setBulkItems(newItems);
                      const newErrors = [...bulkErrors];
                      if (newErrors[index]?.sellPrice) newErrors[index].sellPrice = undefined;
                      setBulkErrors(newErrors);
                    }}
                    placeholder="Satış ₺"
                    min="0"
                    step="0.01"
                    containerClassName="col-span-2"
                    className="text-sm"
                    error={bulkErrors[index]?.sellPrice}
                  />
                  <div className="col-span-2 text-center">
                    <div className="text-blue-400 font-semibold text-xs">
                      {formatCurrency(item.quantity * item.buyPrice)}
                    </div>
                    <div className="text-green-400 text-xs">
                      Kar: %{item.buyPrice > 0 ? (((item.sellPrice - item.buyPrice) / item.buyPrice) * 100).toFixed(1) : '0'}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => {
                        if (bulkItems.length > 1) {
                          setBulkItems(bulkItems.filter((_, i) => i !== index));
                          setBulkErrors(bulkErrors.filter((_, i) => i !== index));
                        }
                      }}
                      className="text-red-500 hover:text-red-400 transition-colors"
                      disabled={bulkItems.length === 1}
                    >
                      <i className="fa-solid fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between items-center border-t border-white/10 pt-4">
              <button
                onClick={() => {
                  setBulkItems([...bulkItems, { name: '', quantity: 1, buyPrice: 0, sellPrice: 0 }]);
                  setBulkErrors([...bulkErrors, {}]);
                }}
                className="secondary-btn"
              >
                <i className="fa-solid fa-plus mr-2"></i>
                Yeni Satır
              </button>
              
              <div className="text-center">
                <div className="font-bold text-lg text-blue-400">
                  Toplam Maliyet: {formatCurrency(bulkItems.reduce((sum, item) => sum + (item.quantity * item.buyPrice), 0))}
                </div>
                <div className="font-semibold text-green-400">
                  Toplam Kar: {formatCurrency(bulkItems.reduce((sum, item) => sum + (item.quantity * (item.sellPrice - item.buyPrice)), 0))}
                </div>
              </div>
              
              <button
                onClick={handleBulkAdd}
                className="primary-btn"
              >
                Tümünü Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddStockModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-md p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-white">Stok Ekle</h3>
              <button 
                onClick={() => setShowAddStockModal(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-400 mb-2">Ürün: {selectedProduct.name}</p>
              <p className="text-sm text-gray-500 mb-4">Mevcut Stok: {selectedProduct.quantity}</p>
              
              <label className="block text-sm font-medium text-gray-400 mb-2">Eklenecek Miktar</label>
              <input
                type="number"
                value={stockAmount}
                onChange={(e) => setStockAmount(parseInt(e.target.value) || 1)}
                min="1"
                className="form-input"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleAddStock}
                className="flex-1 primary-btn"
              >
                Stok Ekle
              </button>
              <button
                onClick={() => setShowAddStockModal(false)}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Cart Modal */}
      {showAddToCartModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-md p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-white">Sepete Ekle</h3>
              <button 
                onClick={() => setShowAddToCartModal(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-400 mb-2">Ürün: {selectedProduct.name}</p>
              <div className="text-sm text-gray-500 mb-4 space-y-1">
                <p>Mevcut Stok: {selectedProduct.quantity}</p>
                <p>Alış Fiyatı: {formatCurrency(selectedProduct.buyPrice)}</p>
                <p>Satış Fiyatı: {formatCurrency(selectedProduct.sellPrice)}</p>
                <p className="text-green-400">Birim Kar: {formatCurrency(selectedProduct.sellPrice - selectedProduct.buyPrice)}</p>
              </div>
              
              <label className="block text-sm font-medium text-gray-400 mb-2">Miktar</label>
              <input
                type="number"
                value={cartQuantity}
                onChange={(e) => setCartQuantity(parseInt(e.target.value) || 1)}
                min="1"
                max={selectedProduct.quantity}
                className="form-input"
              />
              
              {cartQuantity > 0 && (
                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-1">
                  <p className="text-sm text-gray-400">
                    Toplam Satış: {formatCurrency(selectedProduct.sellPrice * cartQuantity)}
                  </p>
                  <p className="text-sm text-green-400">
                    Toplam Kar: {formatCurrency((selectedProduct.sellPrice - selectedProduct.buyPrice) * cartQuantity)}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={cartQuantity <= 0 || cartQuantity > selectedProduct.quantity}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sepete Ekle
              </button>
              <button
                onClick={() => setShowAddToCartModal(false)}
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

export default Stok;