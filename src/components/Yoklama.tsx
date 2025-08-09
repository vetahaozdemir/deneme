import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';

dayjs.locale('tr');

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  unit: string;
  status: 'Yatan' | 'İzinli' | 'KİA' | 'İDE' | 'Hastane' | 'Gezi' | 'Misafir' | 'Diğer';
  gender: 'Erkek' | 'Kız';
  notes?: string;
  lastUpdated: string;
  createdBy: string;
}

interface AttendanceRecord {
  id: string;
  childId: string;
  date: string;
  status: string;
  notes?: string;
  updatedBy: string;
  timestamp: string;
}

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  permission: number;
  other: number;
}

const Yoklama: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'children' | 'attendance' | 'reports' | 'add-child'>('dashboard');
  const [children, setChildren] = useState<Child[]>([]);
  const [filteredChildren, setFilteredChildren] = useState<Child[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    unit: '',
    status: '',
    age: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [childForm, setChildForm] = useState<Partial<Child>>({});
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));

  const units = [
    "A-1", "A-2", "A-3", "A-4", "A-9", "A-10", "A-11", "A-12", 
    "A-13", "A-14", "A-15", "A-16", "A-17", "A-18", "A-19", "A-20", 
    "A-21", "A-22", "A-23", "A-24", "A-25", "A-26", "A-27", "Üniversiteliler"
  ];

  const statuses: Array<'Yatan' | 'İzinli' | 'KİA' | 'İDE' | 'Hastane' | 'Gezi' | 'Misafir' | 'Diğer'> = [
    'Yatan', 'İzinli', 'KİA', 'İDE', 'Hastane', 'Gezi', 'Misafir', 'Diğer'
  ];

  // Demo data initialization
  useEffect(() => {
    const demoChildren: Child[] = [
      {
        id: '1',
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        birthDate: '2010-03-15',
        unit: 'A-1',
        status: 'Yatan',
        gender: 'Kız',
        notes: 'Düzenli katılım',
        lastUpdated: dayjs().subtract(1, 'hour').toISOString(),
        createdBy: 'Sistem'
      },
      {
        id: '2',
        firstName: 'Mehmet',
        lastName: 'Demir',
        birthDate: '2012-08-22',
        unit: 'A-2',
        status: 'İzinli',
        gender: 'Erkek',
        notes: 'Hafta sonu izni',
        lastUpdated: dayjs().subtract(2, 'hours').toISOString(),
        createdBy: 'Sistem'
      },
      {
        id: '3',
        firstName: 'Zeynep',
        lastName: 'Kaya',
        birthDate: '2009-12-10',
        unit: 'A-1',
        status: 'Yatan',
        gender: 'Kız',
        lastUpdated: dayjs().subtract(30, 'minutes').toISOString(),
        createdBy: 'Sistem'
      },
      {
        id: '4',
        firstName: 'Ali',
        lastName: 'Özkan',
        birthDate: '2011-05-18',
        unit: 'A-3',
        status: 'Hastane',
        gender: 'Erkek',
        notes: 'Rutin kontrol',
        lastUpdated: dayjs().subtract(4, 'hours').toISOString(),
        createdBy: 'Sistem'
      },
      {
        id: '5',
        firstName: 'Fatma',
        lastName: 'Çelik',
        birthDate: '2013-09-25',
        unit: 'A-2',
        status: 'Yatan',
        gender: 'Kız',
        lastUpdated: dayjs().subtract(15, 'minutes').toISOString(),
        createdBy: 'Sistem'
      },
      {
        id: '6',
        firstName: 'Emre',
        lastName: 'Aksoy',
        birthDate: '2008-07-03',
        unit: 'Üniversiteliler',
        status: 'KİA',
        gender: 'Erkek',
        notes: 'Üniversite eğitimi',
        lastUpdated: dayjs().subtract(1, 'day').toISOString(),
        createdBy: 'Sistem'
      }
    ];

    const demoAttendanceRecords: AttendanceRecord[] = [
      {
        id: '1',
        childId: '1',
        date: selectedDate,
        status: 'Yatan',
        updatedBy: 'Demo User',
        timestamp: dayjs().toISOString()
      },
      {
        id: '2',
        childId: '2',
        date: selectedDate,
        status: 'İzinli',
        notes: 'Hafta sonu izni',
        updatedBy: 'Demo User',
        timestamp: dayjs().toISOString()
      },
      {
        id: '3',
        childId: '3',
        date: selectedDate,
        status: 'Yatan',
        updatedBy: 'Demo User',
        timestamp: dayjs().toISOString()
      }
    ];

    setChildren(demoChildren);
    setFilteredChildren(demoChildren);
    setAttendanceRecords(demoAttendanceRecords);
  }, [selectedDate]);

  // Apply filters and search
  useEffect(() => {
    let filtered = [...children];

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(child => 
        `${child.firstName} ${child.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        child.unit.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply filters
    if (filters.unit) {
      filtered = filtered.filter(child => child.unit === filters.unit);
    }
    if (filters.status) {
      filtered = filtered.filter(child => child.status === filters.status);
    }
    if (filters.age) {
      const today = dayjs();
      filtered = filtered.filter(child => {
        const age = today.diff(dayjs(child.birthDate), 'year');
        switch (filters.age) {
          case '0-5': return age >= 0 && age <= 5;
          case '6-10': return age >= 6 && age <= 10;
          case '11-15': return age >= 11 && age <= 15;
          case '16+': return age >= 16;
          default: return true;
        }
      });
    }

    setFilteredChildren(filtered);
  }, [children, searchQuery, filters]);

  const calculateAge = (birthDate: string) => {
    return dayjs().diff(dayjs(birthDate), 'year');
  };

  const getStats = (): AttendanceStats => {
    const total = children.length;
    const present = children.filter(child => child.status === 'Yatan').length;
    const absent = children.filter(child => ['İzinli', 'KİA', 'İDE'].includes(child.status)).length;
    const permission = children.filter(child => child.status === 'İzinli').length;
    const other = children.filter(child => ['Hastane', 'Gezi', 'Misafir', 'Diğer'].includes(child.status)).length;

    return { total, present, absent, permission, other };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Yatan': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'İzinli': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'KİA': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'İDE': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'Hastane': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'Gezi': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'Misafir': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const updateChildStatus = (childId: string, newStatus: string) => {
    setChildren(prev => prev.map(child => 
      child.id === childId 
        ? { ...child, status: newStatus as any, lastUpdated: dayjs().toISOString() }
        : child
    ));
  };

  const addChild = () => {
    if (!childForm.firstName || !childForm.lastName || !childForm.birthDate || !childForm.unit) return;

    const newChild: Child = {
      id: Date.now().toString(),
      firstName: childForm.firstName,
      lastName: childForm.lastName,
      birthDate: childForm.birthDate,
      unit: childForm.unit,
      status: (childForm.status as any) || 'Yatan',
      gender: (childForm.gender as any) || 'Kız',
      notes: childForm.notes,
      lastUpdated: dayjs().toISOString(),
      createdBy: 'Demo User'
    };

    setChildren([...children, newChild]);
    setShowAddModal(false);
    setChildForm({});
  };

  const exportData = () => {
    const csvData = children.map(child => ({
      'Ad': child.firstName,
      'Soyad': child.lastName,
      'Yaş': calculateAge(child.birthDate),
      'Birim': child.unit,
      'Durum': child.status,
      'Cinsiyet': child.gender,
      'Notlar': child.notes || '',
      'Son Güncelleme': dayjs(child.lastUpdated).format('DD/MM/YYYY HH:mm')
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yoklama-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const renderDashboard = () => {
    const stats = getStats();
    const recentlyUpdated = children
      .sort((a, b) => dayjs(b.lastUpdated).unix() - dayjs(a.lastUpdated).unix())
      .slice(0, 5);

    return (
      <div className="space-y-6">
        {/* Date Selector */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Günlük Yoklama</h2>
              <p className="text-gray-400">Seçili Tarih: {dayjs(selectedDate).format('DD MMMM YYYY dddd')}</p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-all"
              >
                Bugün
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-users text-blue-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Toplam</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-check text-green-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Yatan</p>
                <p className="text-2xl font-bold text-white">{stats.present}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-user-clock text-yellow-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">İzinli</p>
                <p className="text-2xl font-bold text-white">{stats.permission}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-user-times text-red-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Eksik</p>
                <p className="text-2xl font-bold text-white">{stats.absent}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-ellipsis-h text-orange-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Diğer</p>
                <p className="text-2xl font-bold text-white">{stats.other}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Hızlı İşlemler</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setCurrentView('children')}
              className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 p-4 rounded-xl transition-all text-left"
            >
              <i className="fas fa-list text-2xl mb-2"></i>
              <h4 className="font-semibold">Çocuk Listesi</h4>
              <p className="text-sm opacity-80">Tüm çocukları görüntüle</p>
            </button>
            
            <button
              onClick={() => setCurrentView('attendance')}
              className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 p-4 rounded-xl transition-all text-left"
            >
              <i className="fas fa-clipboard-check text-2xl mb-2"></i>
              <h4 className="font-semibold">Yoklama Al</h4>
              <p className="text-sm opacity-80">Günlük yoklama işlemleri</p>
            </button>
            
            <button
              onClick={exportData}
              className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 p-4 rounded-xl transition-all text-left"
            >
              <i className="fas fa-download text-2xl mb-2"></i>
              <h4 className="font-semibold">Rapor İndir</h4>
              <p className="text-sm opacity-80">CSV formatında dışa aktar</p>
            </button>
          </div>
        </div>

        {/* Recently Updated */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Son Güncellemeler</h3>
          <div className="space-y-3">
            {recentlyUpdated.map(child => (
              <div key={child.id} className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {child.firstName[0]}{child.lastName[0]}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{child.firstName} {child.lastName}</h4>
                    <p className="text-sm text-gray-400">{child.unit}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`px-2 py-1 rounded-full text-xs border ${getStatusColor(child.status)}`}>
                    {child.status}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {dayjs(child.lastUpdated).format('HH:mm')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderChildren = () => {
    return (
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Çocuk Listesi</h2>
              <p className="text-gray-400">Toplam {filteredChildren.length} çocuk</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  showFilters ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <i className="fas fa-filter mr-2"></i>
                Filtrele
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-all"
              >
                <i className="fas fa-plus mr-2"></i>
                Yeni Çocuk
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Ad, soyad veya birim ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <select
                value={filters.unit}
                onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
                className="bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tüm Birimler</option>
                {units.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
              
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tüm Durumlar</option>
                {statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              
              <select
                value={filters.age}
                onChange={(e) => setFilters({ ...filters, age: e.target.value })}
                className="bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tüm Yaşlar</option>
                <option value="0-5">0-5 yaş</option>
                <option value="6-10">6-10 yaş</option>
                <option value="11-15">11-15 yaş</option>
                <option value="16+">16+ yaş</option>
              </select>
            </div>
          )}
        </div>

        {/* Children List */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 overflow-hidden">
          <div className="grid grid-cols-1 gap-1">
            {filteredChildren.map(child => (
              <div key={child.id} className="p-4 hover:bg-gray-700/20 transition-all border-b border-gray-700/30 last:border-b-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {child.firstName[0]}{child.lastName[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{child.firstName} {child.lastName}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span><i className="fas fa-map-marker-alt mr-1"></i>{child.unit}</span>
                        <span><i className="fas fa-birthday-cake mr-1"></i>{calculateAge(child.birthDate)} yaş</span>
                        <span><i className="fas fa-venus-mars mr-1"></i>{child.gender}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <select
                      value={child.status}
                      onChange={(e) => updateChildStatus(child.id, e.target.value)}
                      className={`px-3 py-1 rounded-lg text-sm border ${getStatusColor(child.status)} bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    >
                      {statuses.map(status => (
                        <option key={status} value={status} className="bg-gray-800 text-white">{status}</option>
                      ))}
                    </select>
                    <div className="text-xs text-gray-500">
                      {dayjs(child.lastUpdated).format('HH:mm')}
                    </div>
                  </div>
                </div>
                
                {child.notes && (
                  <div className="mt-2 text-sm text-gray-400 ml-16">
                    <i className="fas fa-comment mr-2"></i>
                    {child.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderAttendance = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Yoklama Sistemi</h2>
          <button className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg">
            <i className="fas fa-clipboard-check mr-2"></i>
            Yeni Yoklama
          </button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Bugünkü Yoklama</h3>
            <div className="space-y-3">
              {children.slice(0, 5).map(child => (
                <div key={child.id} className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                  <span className="text-white font-medium">{child.firstName} {child.lastName}</span>
                  <div className="flex gap-2">
                    <button className="w-8 h-8 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center hover:bg-green-500/30 transition-all">
                      <i className="fas fa-check text-sm"></i>
                    </button>
                    <button className="w-8 h-8 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center hover:bg-red-500/30 transition-all">
                      <i className="fas fa-times text-sm"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Yoklama Özeti</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">{Math.floor(children.length * 0.85)}</p>
                <p className="text-sm text-gray-400">Mevcut</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{children.length - Math.floor(children.length * 0.85)}</p>
                <p className="text-sm text-gray-400">Devamsız</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderReports = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Devamsızlık Raporları</h2>
          <button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg">
            <i className="fas fa-file-export mr-2"></i>
            Rapor İndir
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-calendar-week text-blue-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">95%</h3>
              <p className="text-gray-400">Haftalık Devam</p>
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-calendar-alt text-green-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">92%</h3>
              <p className="text-gray-400">Aylık Devam</p>
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-exclamation-triangle text-orange-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">{Math.floor(children.length * 0.15)}</h3>
              <p className="text-gray-400">Riskli Çocuk</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Devamsızlık Detayları</h3>
          <div className="space-y-3">
            {children.slice(0, 8).map(child => {
              const attendanceRate = Math.floor(Math.random() * 30) + 70;
              return (
                <div key={child.id} className="flex items-center justify-between p-4 bg-gray-900/30 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {(child.firstName?.[0] || '') + (child.lastName?.[0] || '')}
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{child.firstName} {child.lastName}</h4>
                      <p className="text-sm text-gray-400">{child.unit}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      attendanceRate >= 90 ? 'text-green-400' :
                      attendanceRate >= 75 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      %{attendanceRate}
                    </p>
                    <p className="text-xs text-gray-500">Devam Oranı</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const navigationItems = [
    { id: 'dashboard', name: 'Panel', icon: 'fa-chart-line' },
    { id: 'children', name: 'Çocuklar', icon: 'fa-users' },
    { id: 'attendance', name: 'Yoklama', icon: 'fa-clipboard-check' },
    { id: 'reports', name: 'Raporlar', icon: 'fa-chart-bar' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-sky-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl flex items-center justify-center">
                <i className="fas fa-users text-white"></i>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Dijital Yoklama Sistemi</h1>
                <p className="text-sm text-gray-400">Modern çocuk takip sistemi</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={exportData}
                className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium transition-all"
              >
                <i className="fas fa-download mr-2"></i>
                Dışa Aktar
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-2 mb-6">
          <div className="flex justify-around items-center">
            {navigationItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as any)}
                className={`flex flex-col items-center px-6 py-3 rounded-xl transition-all ${
                  currentView === item.id
                    ? 'text-sky-400 bg-sky-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <i className={`fas ${item.icon} text-lg mb-1`}></i>
                <span className="text-sm font-medium">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-[600px]">
          {currentView === 'dashboard' && renderDashboard()}
          {currentView === 'children' && renderChildren()}
          {currentView === 'attendance' && renderAttendance()}
          {currentView === 'reports' && renderReports()}
        </div>
      </div>

      {/* Add Child Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl border border-gray-700/50 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700/50">
              <h3 className="text-xl font-bold text-white">Yeni Çocuk Ekle</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Ad *</label>
                  <input
                    type="text"
                    value={childForm.firstName || ''}
                    onChange={(e) => setChildForm({ ...childForm, firstName: e.target.value })}
                    className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ad"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Soyad *</label>
                  <input
                    type="text"
                    value={childForm.lastName || ''}
                    onChange={(e) => setChildForm({ ...childForm, lastName: e.target.value })}
                    className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Soyad"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Doğum Tarihi *</label>
                <input
                  type="date"
                  value={childForm.birthDate || ''}
                  onChange={(e) => setChildForm({ ...childForm, birthDate: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Birim *</label>
                <select
                  value={childForm.unit || ''}
                  onChange={(e) => setChildForm({ ...childForm, unit: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Birim Seçin</option>
                  {units.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Cinsiyet</label>
                <select
                  value={childForm.gender || 'Kız'}
                  onChange={(e) => setChildForm({ ...childForm, gender: e.target.value as any })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Kız">Kız</option>
                  <option value="Erkek">Erkek</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Durum</label>
                <select
                  value={childForm.status || 'Yatan'}
                  onChange={(e) => setChildForm({ ...childForm, status: e.target.value as any })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notlar</label>
                <textarea
                  value={childForm.notes || ''}
                  onChange={(e) => setChildForm({ ...childForm, notes: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Ek notlar..."
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-700/50 flex gap-3">
              <button
                onClick={addChild}
                disabled={!childForm.firstName || !childForm.lastName || !childForm.birthDate || !childForm.unit}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-all"
              >
                Çocuk Ekle
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setChildForm({});
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-lg font-medium transition-all"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Yoklama;