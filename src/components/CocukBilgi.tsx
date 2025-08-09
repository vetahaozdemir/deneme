import React, { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';

dayjs.locale('tr');

interface Child {
  id: string;
  name: string;
  birthDate: string;
  gender: 'erkek' | 'kız';
  admissionDate: string;
  currentInstitution: string;
  bloodType?: string;
  allergies?: string[];
  parentId: string;
  photoUrl?: string;
  status: 'active' | 'transferred' | 'adopted';
}

interface HealthRecord {
  id: string;
  childId: string;
  date: string;
  type: 'vaccination' | 'checkup' | 'illness' | 'medication';
  title: string;
  description: string;
  provider: string;
  attachments?: string[];
}

interface EducationRecord {
  id: string;
  childId: string;
  year: string;
  school: string;
  grade: string;
  subject: string;
  score?: number;
  teacher?: string;
  notes?: string;
}

interface Document {
  id: string;
  childId: string;
  type: 'legal' | 'medical' | 'educational' | 'personal';
  title: string;
  description?: string;
  uploadDate: string;
  fileUrl: string;
  isConfidential: boolean;
}

interface DevelopmentMilestone {
  id: string;
  childId: string;
  category: 'physical' | 'cognitive' | 'social' | 'emotional';
  milestone: string;
  expectedAge: number; // in months
  achievedDate?: string;
  achieved: boolean;
  notes?: string;
}

const CocukBilgi: React.FC = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'profiles' | 'documents' | 'education' | 'health' | 'reports'>('dashboard');
  const [children, setChildren] = useState<Child[]>([]);
  const [currentChild, setCurrentChild] = useState<Child | null>(null);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [educationRecords, setEducationRecords] = useState<EducationRecord[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [milestones, setMilestones] = useState<DevelopmentMilestone[]>([]);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [childForm, setChildForm] = useState<Partial<Child>>({});

  // Load demo data
  const loadDemoData = useCallback(() => {
    const demoChildren: Child[] = [
      {
        id: '1',
        name: 'Ayşe Yılmaz',
        birthDate: '2015-03-15',
        gender: 'kız',
        admissionDate: '2020-09-01',
        currentInstitution: 'Çocuk Evi A',
        bloodType: 'A+',
        allergies: ['Polen', 'Fındık'],
        parentId: user?.uid || 'default-user',
        status: 'active'
      },
      {
        id: '2',
        name: 'Mehmet Demir',
        birthDate: '2012-08-22',
        gender: 'erkek',
        admissionDate: '2018-06-15',
        currentInstitution: 'Çocuk Evi B',
        bloodType: 'O+',
        parentId: user?.uid || 'default-user',
        status: 'active'
      },
      {
        id: '3',
        name: 'Zeynep Kaya',
        birthDate: '2017-12-10',
        gender: 'kız',
        admissionDate: '2021-02-20',
        currentInstitution: 'Çocuk Evi A',
        bloodType: 'B+',
        allergies: ['Gluten'],
        parentId: user?.uid || 'default-user',
        status: 'active'
      }
    ];

    const demoHealthRecords: HealthRecord[] = [
      {
        id: '1',
        childId: '1',
        date: '2024-01-15',
        type: 'vaccination',
        title: 'Grip Aşısı',
        description: 'Yıllık grip aşısı uygulandı',
        provider: 'Dr. Ahmet Yılmaz - Şehir Hastanesi'
      },
      {
        id: '2',
        childId: '1',
        date: '2024-01-10',
        type: 'checkup',
        title: 'Rutin Sağlık Kontrolü',
        description: 'Genel sağlık durumu iyi, gelişim normal',
        provider: 'Dr. Fatma Demir - Çocuk Doktoru'
      },
      {
        id: '3',
        childId: '2',
        date: '2024-01-05',
        type: 'illness',
        title: 'Soğuk Algınlığı',
        description: 'Hafif soğuk algınlığı, 3 gün istirahat',
        provider: 'Dr. Can Özkan - Aile Hekimi'
      }
    ];

    const demoEducationRecords: EducationRecord[] = [
      {
        id: '1',
        childId: '1',
        year: '2023-2024',
        school: 'Atatürk İlkokulu',
        grade: '4. Sınıf',
        subject: 'Matematik',
        score: 85,
        teacher: 'Ayşe Öğretmen',
        notes: 'Matematik dersinde çok başarılı'
      },
      {
        id: '2',
        childId: '1',
        year: '2023-2024',
        school: 'Atatürk İlkokulu',
        grade: '4. Sınıf',
        subject: 'Türkçe',
        score: 92,
        teacher: 'Mehmet Öğretmen',
        notes: 'Okuma yazma becerileri çok iyi'
      },
      {
        id: '3',
        childId: '2',
        year: '2023-2024',
        school: 'Cumhuriyet Ortaokulu',
        grade: '7. Sınıf',
        subject: 'Fen Bilimleri',
        score: 78,
        teacher: 'Zeynep Öğretmen'
      }
    ];

    const demoDocuments: Document[] = [
      {
        id: '1',
        childId: '1',
        type: 'legal',
        title: 'Kimlik Belgesi',
        description: 'Nüfus cüzdanı fotokopisi',
        uploadDate: '2020-09-01',
        fileUrl: '#',
        isConfidential: true
      },
      {
        id: '2',
        childId: '1',
        type: 'medical',
        title: 'Sağlık Raporu',
        description: '2024 yılı genel sağlık raporu',
        uploadDate: '2024-01-20',
        fileUrl: '#',
        isConfidential: false
      },
      {
        id: '3',
        childId: '2',
        type: 'educational',
        title: 'Karne',
        description: '2023-2024 Güz Dönemi Karnesi',
        uploadDate: '2024-01-25',
        fileUrl: '#',
        isConfidential: false
      }
    ];

    const demoMilestones: DevelopmentMilestone[] = [
      {
        id: '1',
        childId: '1',
        category: 'physical',
        milestone: 'Bisiklet sürmeyi öğrendi',
        expectedAge: 60,
        achievedDate: '2023-05-20',
        achieved: true,
        notes: 'Desteksiz bisiklet sürebiliyor'
      },
      {
        id: '2',
        childId: '1',
        category: 'cognitive',
        milestone: 'Temel matematik işlemleri',
        expectedAge: 72,
        achievedDate: '2023-09-10',
        achieved: true,
        notes: 'Toplama çıkarma işlemlerini yapabiliyor'
      },
      {
        id: '3',
        childId: '1',
        category: 'social',
        milestone: 'Arkadaşlarıyla oyun oynama',
        expectedAge: 48,
        achieved: false,
        notes: 'Grup oyunlarına katılmada tereddüt ediyor'
      }
    ];

    setChildren(demoChildren);
    setCurrentChild(demoChildren[0]);
    setHealthRecords(demoHealthRecords);
    setEducationRecords(demoEducationRecords);
    setDocuments(demoDocuments);
    setMilestones(demoMilestones);
  }, []);

  // Load data from Firebase
  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid, 'cocukBilgiData', 'main');
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setChildren(data.children || []);
        setHealthRecords(data.healthRecords || []);
        setEducationRecords(data.educationRecords || []);
        setDocuments(data.documents || []);
        setMilestones(data.milestones || []);
        if (data.children && data.children.length > 0) {
          setCurrentChild(data.children[0]);
        }
      } else {
        loadDemoData();
      }
    } catch (error) {
      console.error('Çocuk bilgi veri yükleme hatası:', error);
      loadDemoData();
    }
  }, [user, loadDemoData]);

  // Save data to Firebase
  const saveData = useCallback(async () => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid, 'cocukBilgiData', 'main');
      await setDoc(userDocRef, {
        children,
        healthRecords,
        educationRecords,
        documents,
        milestones,
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
      console.error('Çocuk bilgi veri kaydetme hatası:', error);
    }
  }, [user, children, healthRecords, educationRecords, documents, milestones]);


  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Save data when state changes
  useEffect(() => {
    if (user && children.length > 0) {
      saveData();
    }
  }, [user, children, healthRecords, educationRecords, documents, milestones, saveData]);

  const calculateAge = (birthDate: string) => {
    const today = dayjs();
    const birth = dayjs(birthDate);
    const years = today.diff(birth, 'year');
    const months = today.diff(birth.add(years, 'year'), 'month');
    return `${years} yaş ${months} ay`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const addChild = () => {
    if (!childForm.name || !childForm.birthDate) return;

    const newChild: Child = {
      id: Date.now().toString(),
      name: childForm.name,
      birthDate: childForm.birthDate,
      gender: (childForm.gender as 'erkek' | 'kız') || 'kız',
      admissionDate: childForm.admissionDate || dayjs().format('YYYY-MM-DD'),
      currentInstitution: childForm.currentInstitution || 'Çocuk Evi A',
      bloodType: childForm.bloodType,
      allergies: childForm.allergies || [],
      parentId: user?.uid || 'default-user',
      status: 'active'
    };

    setChildren([...children, newChild]);
    setShowAddChildModal(false);
    setChildForm({});
    saveData();
  };

  const renderDashboard = () => {
    if (!currentChild) return <div className="text-center text-gray-400 py-8">Çocuk seçiniz</div>;

    const childHealthRecords = healthRecords.filter(r => r.childId === currentChild.id);
    const childEducationRecords = educationRecords.filter(r => r.childId === currentChild.id);
    const childMilestones = milestones.filter(m => m.childId === currentChild.id);
    const achievedMilestones = childMilestones.filter(m => m.achieved).length;
    const totalMilestones = childMilestones.length;

    return (
      <div className="space-y-6">
        {/* Child Profile Card */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
              {getInitials(currentChild.name)}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-2">{currentChild.name}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Yaş</p>
                  <p className="text-white font-medium">{calculateAge(currentChild.birthDate)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Cinsiyet</p>
                  <p className="text-white font-medium capitalize">{currentChild.gender}</p>
                </div>
                <div>
                  <p className="text-gray-400">Kan Grubu</p>
                  <p className="text-white font-medium">{currentChild.bloodType || 'Bilinmiyor'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Kurum</p>
                  <p className="text-white font-medium">{currentChild.currentInstitution}</p>
                </div>
              </div>
              {currentChild.allergies && currentChild.allergies.length > 0 && (
                <div className="mt-3">
                  <p className="text-gray-400 text-sm mb-1">Alerjiler</p>
                  <div className="flex flex-wrap gap-2">
                    {currentChild.allergies.map((allergy, index) => (
                      <span key={index} className="px-2 py-1 bg-red-500/20 text-red-300 rounded-full text-xs">
                        {allergy}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-heart-pulse text-blue-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Sağlık Kayıtları</p>
                <p className="text-2xl font-bold text-white">{childHealthRecords.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-graduation-cap text-green-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Eğitim Kayıtları</p>
                <p className="text-2xl font-bold text-white">{childEducationRecords.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-file-alt text-purple-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Belgeler</p>
                <p className="text-2xl font-bold text-white">{documents.filter(d => d.childId === currentChild.id).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                <i className="fas fa-chart-line text-orange-400 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-400">Gelişim</p>
                <p className="text-2xl font-bold text-white">{achievedMilestones}/{totalMilestones}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Health Records */}
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
              <i className="fas fa-heart-pulse text-red-400"></i>
              Son Sağlık Kayıtları
            </h3>
            <div className="space-y-3">
              {childHealthRecords.slice(0, 3).map(record => (
                <div key={record.id} className="bg-gray-900/30 p-3 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-white text-sm">{record.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">{record.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{record.provider}</p>
                    </div>
                    <span className="text-xs text-gray-400">{dayjs(record.date).format('DD/MM/YYYY')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Education Records */}
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
              <i className="fas fa-graduation-cap text-green-400"></i>
              Son Eğitim Kayıtları
            </h3>
            <div className="space-y-3">
              {childEducationRecords.slice(0, 3).map(record => (
                <div key={record.id} className="bg-gray-900/30 p-3 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-white text-sm">{record.subject}</h4>
                      <p className="text-xs text-gray-400 mt-1">{record.school} - {record.grade}</p>
                      {record.teacher && <p className="text-xs text-gray-500 mt-1">{record.teacher}</p>}
                    </div>
                    <div className="text-right">
                      {record.score && (
                        <span className={`text-sm font-semibold ${record.score >= 85 ? 'text-green-400' : record.score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {record.score}
                        </span>
                      )}
                      <p className="text-xs text-gray-400">{record.year}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Development Milestones */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
            <i className="fas fa-seedling text-green-400"></i>
            Gelişim Kilometre Taşları
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {childMilestones.slice(0, 6).map(milestone => (
              <div key={milestone.id} className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm ${
                  milestone.achieved ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                }`}>
                  <i className={`fas ${milestone.achieved ? 'fa-check' : 'fa-clock'}`}></i>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-white">{milestone.milestone}</h4>
                  <p className="text-xs text-gray-400 capitalize">{milestone.category}</p>
                  {milestone.achievedDate && (
                    <p className="text-xs text-green-400">{dayjs(milestone.achievedDate).format('DD/MM/YYYY')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderProfiles = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Çocuk Profilleri</h2>
          <button
            onClick={() => setShowAddChildModal(true)}
            className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg"
          >
            <i className="fas fa-plus mr-2"></i>
            Yeni Çocuk
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children.map(child => (
            <div
              key={child.id}
              className={`bg-gray-800/30 backdrop-blur-xl rounded-2xl border p-6 cursor-pointer transition-all transform hover:scale-105 ${
                currentChild?.id === child.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-700/50 hover:border-gray-600/50'
              }`}
              onClick={() => setCurrentChild(child)}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                  {getInitials(child.name)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{child.name}</h3>
                  <p className="text-sm text-gray-400">{calculateAge(child.birthDate)}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Cinsiyet:</span>
                  <span className="text-white capitalize">{child.gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Kurum:</span>
                  <span className="text-white">{child.currentInstitution}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Giriş:</span>
                  <span className="text-white">{dayjs(child.admissionDate).format('DD/MM/YYYY')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Durum:</span>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    child.status === 'active' ? 'bg-green-500/20 text-green-300' :
                    child.status === 'transferred' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-blue-500/20 text-blue-300'
                  }`}>
                    {child.status === 'active' ? 'Aktif' : child.status === 'transferred' ? 'Nakil' : 'Evlat Edinme'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const addHealthRecord = async (record: Omit<HealthRecord, 'id'>) => {
    const newRecord: HealthRecord = {
      ...record,
      id: Date.now().toString()
    };
    setHealthRecords([...healthRecords, newRecord]);
  };

  const addEducationRecord = async (record: Omit<EducationRecord, 'id'>) => {
    const newRecord: EducationRecord = {
      ...record,
      id: Date.now().toString()
    };
    setEducationRecords([...educationRecords, newRecord]);
  };

  const addDocument = async (document: Omit<Document, 'id' | 'uploadDate'>) => {
    const newDocument: Document = {
      ...document,
      id: Date.now().toString(),
      uploadDate: dayjs().format('YYYY-MM-DD')
    };
    setDocuments([...documents, newDocument]);
  };

  const renderDocuments = () => {
    if (!currentChild) return <div className="text-center text-gray-400 py-8">Çocuk seçiniz</div>;
    
    const childDocuments = documents.filter(d => d.childId === currentChild.id);
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Belgeler</h2>
          <button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg">
            <i className="fas fa-plus mr-2"></i>
            Yeni Belge
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {childDocuments.map(doc => (
            <div key={doc.id} className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  doc.type === 'legal' ? 'bg-red-500/20 text-red-400' :
                  doc.type === 'medical' ? 'bg-blue-500/20 text-blue-400' :
                  doc.type === 'educational' ? 'bg-green-500/20 text-green-400' :
                  'bg-purple-500/20 text-purple-400'
                }`}>
                  <i className={`fas ${
                    doc.type === 'legal' ? 'fa-gavel' :
                    doc.type === 'medical' ? 'fa-heart-pulse' :
                    doc.type === 'educational' ? 'fa-graduation-cap' :
                    'fa-file-alt'
                  } text-xl`}></i>
                </div>
                {doc.isConfidential && (
                  <span className="bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded-full text-xs">
                    <i className="fas fa-lock mr-1"></i>Gizli
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{doc.title}</h3>
              {doc.description && <p className="text-sm text-gray-400 mb-3">{doc.description}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{dayjs(doc.uploadDate).format('DD/MM/YYYY')}</span>
                <button className="text-blue-400 hover:text-blue-300 text-sm">
                  <i className="fas fa-download mr-1"></i>İndir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderEducation = () => {
    if (!currentChild) return <div className="text-center text-gray-400 py-8">Çocuk seçiniz</div>;
    
    const childEducationRecords = educationRecords.filter(r => r.childId === currentChild.id);
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Eğitim Kayıtları</h2>
          <button className="bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg">
            <i className="fas fa-plus mr-2"></i>
            Yeni Kayıt
          </button>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {childEducationRecords.map(record => (
            <div key={record.id} className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                      <i className="fas fa-graduation-cap text-green-400 text-xl"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{record.subject}</h3>
                      <p className="text-sm text-gray-400">{record.school} - {record.grade}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Yıl</p>
                      <p className="text-white font-medium">{record.year}</p>
                    </div>
                    {record.teacher && (
                      <div>
                        <p className="text-gray-400">Öğretmen</p>
                        <p className="text-white font-medium">{record.teacher}</p>
                      </div>
                    )}
                    {record.score && (
                      <div>
                        <p className="text-gray-400">Not</p>
                        <p className={`font-medium ${
                          record.score >= 85 ? 'text-green-400' :
                          record.score >= 70 ? 'text-yellow-400' : 'text-red-400'
                        }`}>{record.score}</p>
                      </div>
                    )}
                  </div>
                  {record.notes && (
                    <div className="mt-3">
                      <p className="text-gray-400 text-sm mb-1">Notlar</p>
                      <p className="text-white text-sm">{record.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderHealth = () => {
    if (!currentChild) return <div className="text-center text-gray-400 py-8">Çocuk seçiniz</div>;
    
    const childHealthRecords = healthRecords.filter(r => r.childId === currentChild.id);
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Sağlık Kayıtları</h2>
          <button className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg">
            <i className="fas fa-plus mr-2"></i>
            Yeni Kayıt
          </button>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {childHealthRecords.map(record => (
            <div key={record.id} className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      record.type === 'vaccination' ? 'bg-green-500/20 text-green-400' :
                      record.type === 'checkup' ? 'bg-blue-500/20 text-blue-400' :
                      record.type === 'illness' ? 'bg-red-500/20 text-red-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      <i className={`fas ${
                        record.type === 'vaccination' ? 'fa-syringe' :
                        record.type === 'checkup' ? 'fa-stethoscope' :
                        record.type === 'illness' ? 'fa-thermometer' :
                        'fa-pills'
                      } text-xl`}></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{record.title}</h3>
                      <p className="text-sm text-gray-400">{dayjs(record.date).format('DD/MM/YYYY')}</p>
                    </div>
                  </div>
                  <p className="text-white mb-2">{record.description}</p>
                  <p className="text-sm text-gray-400">{record.provider}</p>
                  <div className="mt-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      record.type === 'vaccination' ? 'bg-green-500/20 text-green-300' :
                      record.type === 'checkup' ? 'bg-blue-500/20 text-blue-300' :
                      record.type === 'illness' ? 'bg-red-500/20 text-red-300' :
                      'bg-purple-500/20 text-purple-300'
                    }`}>
                      {record.type === 'vaccination' ? 'Aşı' :
                       record.type === 'checkup' ? 'Kontrol' :
                       record.type === 'illness' ? 'Hastalık' : 'İlaç'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReports = () => {
    if (!currentChild) return <div className="text-center text-gray-400 py-8">Çocuk seçiniz</div>;
    
    const childHealthRecords = healthRecords.filter(r => r.childId === currentChild.id);
    const childEducationRecords = educationRecords.filter(r => r.childId === currentChild.id);
    const childDocuments = documents.filter(d => d.childId === currentChild.id);
    const childMilestones = milestones.filter(m => m.childId === currentChild.id);
    const achievedMilestones = childMilestones.filter(m => m.achieved).length;
    
    const averageScore = childEducationRecords.length > 0 
      ? childEducationRecords.reduce((sum, r) => sum + (r.score || 0), 0) / childEducationRecords.filter(r => r.score).length 
      : 0;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Raporlar ve İstatistikler</h2>
          <button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-6 py-2 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg">
            <i className="fas fa-download mr-2"></i>
            Rapor İndir
          </button>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-heart-pulse text-blue-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">{childHealthRecords.length}</h3>
              <p className="text-gray-400">Sağlık Kaydı</p>
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-graduation-cap text-green-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">{averageScore.toFixed(1)}</h3>
              <p className="text-gray-400">Ortalama Not</p>
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-file-alt text-purple-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">{childDocuments.length}</h3>
              <p className="text-gray-400">Belge</p>
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-chart-line text-orange-400 text-2xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-white">{achievedMilestones}/{childMilestones.length}</h3>
              <p className="text-gray-400">Gelişim</p>
            </div>
          </div>
        </div>
        
        {/* Detailed Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Sağlık Kayıtları Dağılımı</h3>
            <div className="space-y-3">
              {['vaccination', 'checkup', 'illness', 'medication'].map(type => {
                const count = childHealthRecords.filter(r => r.type === type).length;
                const percentage = childHealthRecords.length > 0 ? (count / childHealthRecords.length) * 100 : 0;
                const typeName = type === 'vaccination' ? 'Aşı' : type === 'checkup' ? 'Kontrol' : type === 'illness' ? 'Hastalık' : 'İlaç';
                
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-gray-300">{typeName}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            type === 'vaccination' ? 'bg-green-400' :
                            type === 'checkup' ? 'bg-blue-400' :
                            type === 'illness' ? 'bg-red-400' : 'bg-purple-400'
                          }`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-white font-medium w-8">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Gelişim İlerlemesi</h3>
            <div className="space-y-3">
              {['physical', 'cognitive', 'social', 'emotional'].map(category => {
                const categoryMilestones = childMilestones.filter(m => m.category === category);
                const achievedCount = categoryMilestones.filter(m => m.achieved).length;
                const percentage = categoryMilestones.length > 0 ? (achievedCount / categoryMilestones.length) * 100 : 0;
                const categoryName = category === 'physical' ? 'Fiziksel' : category === 'cognitive' ? 'Bilişsel' : category === 'social' ? 'Sosyal' : 'Duygusal';
                
                return (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-gray-300">{categoryName}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-700 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-gradient-to-r from-green-400 to-blue-400"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-white font-medium w-12">{achievedCount}/{categoryMilestones.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const navigationItems = [
    { id: 'dashboard', name: 'Ana Sayfa', icon: 'fa-home' },
    { id: 'profiles', name: 'Profiller', icon: 'fa-users' },
    { id: 'documents', name: 'Belgeler', icon: 'fa-gavel' },
    { id: 'education', name: 'Eğitim', icon: 'fa-graduation-cap' },
    { id: 'health', name: 'Sağlık', icon: 'fa-heart-pulse' },
    { id: 'reports', name: 'Raporlar', icon: 'fa-chart-bar' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl flex items-center justify-center">
                <i className="fas fa-shield-halved text-white"></i>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Çocuk Evleri Bilgi Sistemi</h1>
                <p className="text-sm text-gray-400">Kurumsal veri yönetim sistemi</p>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full text-xs">
                Çevrimiçi
              </span>
            </div>
          </div>
        </div>

        {/* Child Selector */}
        {children.length > 1 && (
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Çocuk Seçin</h3>
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => setCurrentChild(child)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                    currentChild?.id === child.id
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-700/30 text-gray-300 hover:bg-gray-600/30'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                    {getInitials(child.name)}
                  </div>
                  <span className="text-sm font-medium">{child.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-2 mb-6">
          <div className="flex justify-around items-center">
            {navigationItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as any)}
                className={`flex flex-col items-center px-3 py-2 rounded-xl transition-all ${
                  currentTab === item.id
                    ? 'text-pink-400 bg-pink-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <i className={`fas ${item.icon} text-lg mb-1`}></i>
                <span className="text-xs font-medium">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-[600px]">
          {currentTab === 'dashboard' && renderDashboard()}
          {currentTab === 'profiles' && renderProfiles()}
          {currentTab === 'documents' && renderDocuments()}
          {currentTab === 'education' && renderEducation()}
          {currentTab === 'health' && renderHealth()}
          {currentTab === 'reports' && renderReports()}
        </div>
      </div>

      {/* Add Child Modal */}
      {showAddChildModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl border border-gray-700/50 w-full max-w-md">
            <div className="p-6 border-b border-gray-700/50">
              <h3 className="text-xl font-bold text-white">Yeni Çocuk Ekle</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Ad Soyad *</label>
                <input
                  type="text"
                  value={childForm.name || ''}
                  onChange={(e) => setChildForm({ ...childForm, name: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Çocuğun adı soyadı"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Doğum Tarihi *</label>
                <input
                  type="date"
                  value={childForm.birthDate || ''}
                  onChange={(e) => setChildForm({ ...childForm, birthDate: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Cinsiyet</label>
                <select
                  value={childForm.gender || 'kız'}
                  onChange={(e) => setChildForm({ ...childForm, gender: e.target.value as 'erkek' | 'kız' })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="kız">Kız</option>
                  <option value="erkek">Erkek</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kurum</label>
                <input
                  type="text"
                  value={childForm.currentInstitution || ''}
                  onChange={(e) => setChildForm({ ...childForm, currentInstitution: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Çocuk Evi A"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kan Grubu</label>
                <select
                  value={childForm.bloodType || ''}
                  onChange={(e) => setChildForm({ ...childForm, bloodType: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seçiniz</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-700/50 flex gap-3">
              <button
                onClick={addChild}
                disabled={!childForm.name || !childForm.birthDate}
                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-all"
              >
                Çocuk Ekle
              </button>
              <button
                onClick={() => {
                  setShowAddChildModal(false);
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

export default CocukBilgi;