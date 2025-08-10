import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, onSnapshot, Timestamp, orderBy, limit, doc, deleteDoc } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { useNotify } from '../hooks/useNotify';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface WeightEntry {
  weight: number;
  date: any;
}

interface StrengthSet {
  reps: number;
  weight: number;
}

interface Workout {
  id?: string;
  type: 'strength' | 'cardio';
  name: string;
  sets?: StrengthSet[];
  duration?: number;
  calories?: number;
  date: any;
}

// Exercise database for smart suggestions
const exerciseDatabase = {
  strength: [
    // Upper Body - Göğüs
    'Bench Press', 'İncline Bench Press', 'Decline Bench Press', 'Dumbbell Press',
    'İncline Dumbbell Press', 'Chest Fly', 'Push-ups', 'Dips',
    // Upper Body - Sırt
    'Lat Pulldown', 'Pull-ups', 'Chin-ups', 'Barbell Row', 'Dumbbell Row',
    'T-Bar Row', 'Cable Row', 'Deadlift', 'Romanian Deadlift',
    // Upper Body - Omuz
    'Shoulder Press', 'Lateral Raise', 'Front Raise', 'Rear Delt Fly',
    'Upright Row', 'Shrugs', 'Arnold Press',
    // Upper Body - Kol
    'Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl',
    'Tricep Extension', 'Close Grip Bench Press', 'Tricep Dips', 'French Press',
    // Lower Body - Bacak
    'Squat', 'Front Squat', 'Bulgarian Split Squat', 'Lunges',
    'Leg Press', 'Leg Extension', 'Leg Curl', 'Calf Raise'
  ],
  cardio: [
    'Koşu', 'Yürüyüş', 'Bisiklet', 'Eliptik', 'Kürek', 'Yüzme',
    'HIIT', 'Tabata', 'Burpee', 'Jump Rope', 'Stair Climbing'
  ]
};

const Fitness: React.FC = () => {
  const { user } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [currentTab, setCurrentTab] = useState<'strength' | 'cardio'>('strength');
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [lastWeight, setLastWeight] = useState<WeightEntry | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredExercises, setFilteredExercises] = useState<string[]>([]);
  
  // Form states
  const [weightInput, setWeightInput] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [sets, setSets] = useState<StrengthSet[]>([{ reps: 0, weight: 0 }]);
  const [cardioName, setCardioName] = useState('');
  const [duration, setDuration] = useState('');
  const [calories, setCalories] = useState('');
  const [performanceInfo, setPerformanceInfo] = useState('');

  // Smart exercise filtering
  const filterExercises = (query: string) => {
    if (!query.trim()) {
      setFilteredExercises([]);
      setShowDropdown(false);
      return;
    }
    
    const currentExercises = exerciseDatabase[currentTab];
    const filtered = currentExercises.filter(exercise =>
      exercise.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredExercises(filtered.slice(0, 8));
    setShowDropdown(filtered.length > 0);
  };

  // Helper functions
  const standardizeName = (name: string) => {
    if (!name) return '';
    return name.trim().toLowerCase().split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatSet = (set: StrengthSet) => `${set.reps} tekrar @ ${set.weight} kg`;
  
  const getBestSet = (sets: StrengthSet[]) => {
    if (!sets || !Array.isArray(sets) || sets.length === 0) return { reps: 0, weight: 0 };
    return sets.reduce((best, current) => 
      current.weight > best.weight ? current : best, sets[0]
    );
  };

  const showAlert = (message: string, isSuccess = false) => {
    if (isSuccess) {
      notifySuccess(message);
    } else {
      notifyError(message);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (user) {
      fetchLastWeight();
      fetchAllExerciseNames();
      listenForDailyLogs();
    }
  }, [user]);

  // Fetch last weight entry
  const fetchLastWeight = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "users", user.uid, "weights"), 
        orderBy("date", "desc"), 
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as WeightEntry;
        setLastWeight(data);
      }
    } catch (error) {
      console.error('Kilo verisi alınırken hata:', error);
    }
  };

  // Save weight entry
  const saveWeight = async () => {
    const weight = parseFloat(weightInput);
    if (!weight || weight <= 0) {
      showAlert("Lütfen geçerli bir kilo girin.");
      return;
    }
    try {
      await addDoc(collection(db, "users", user!.uid, "weights"), {
        weight,
        date: Timestamp.now()
      });
      showAlert("Kilo başarıyla kaydedildi.", true);
      setWeightInput('');
      fetchLastWeight();
    } catch (error) {
      console.error("Kilo kaydetme hatası:", error);
      showAlert("Kilo kaydedilemedi.");
    }
  };

  // Fetch all exercise names
  const fetchAllExerciseNames = async () => {
    if (!user) return;
    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "workouts"));
      const names = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data && data.type === 'strength' && data.name) {
          names.add(data.name);
        }
      });
      setExerciseNames(Array.from(names).sort());
    } catch (error) {
      console.error("Egzersiz isimleri çekilirken hata:", error);
    }
  };

  // Fetch performance info for exercise
  const fetchPerformanceInfo = async (exerciseName: string) => {
    const name = standardizeName(exerciseName);
    if (!name || !user) {
      setPerformanceInfo('');
      return;
    }
    
    try {
      const snapshot = await getDocs(collection(db, 'users', user.uid, 'workouts'));
      const relevantWorkouts: any[] = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.type === 'strength' && data.name === name) {
          relevantWorkouts.push(data);
        }
      });

      if (relevantWorkouts.length === 0) {
        setPerformanceInfo("Bu hareket için geçmiş veri bulunamadı.");
        return;
      }

      relevantWorkouts.sort((a, b) => {
        const dateA = a.date && typeof a.date.toMillis === 'function' ? a.date.toMillis() : 0;
        const dateB = b.date && typeof b.date.toMillis === 'function' ? b.date.toMillis() : 0;
        return dateA - dateB;
      });
      
      const firstWorkout = relevantWorkouts[0];
      const lastWorkout = relevantWorkouts[relevantWorkouts.length - 1];
      
      const bestFirstSet = getBestSet(firstWorkout.sets);
      const bestLastSet = getBestSet(lastWorkout.sets);
      
      const firstDate = firstWorkout.date && typeof firstWorkout.date.toDate === 'function' 
        ? firstWorkout.date.toDate().toLocaleDateString() : 'N/A';
      const lastDate = lastWorkout.date && typeof lastWorkout.date.toDate === 'function' 
        ? lastWorkout.date.toDate().toLocaleDateString() : 'N/A';

      setPerformanceInfo(`İlk: ${formatSet(bestFirstSet)} (${firstDate}) | Son: ${formatSet(bestLastSet)} (${lastDate})`);
    } catch (error) {
      console.error("Performans bilgisi çekilirken hata:", error);
      setPerformanceInfo('Veri çekilemedi.');
    }
  };

  // Add set row
  const addSetRow = () => {
    setSets([...sets, { reps: 0, weight: 0 }]);
  };

  // Update set
  const updateSet = (index: number, field: 'reps' | 'weight', value: number) => {
    const newSets = [...sets];
    newSets[index][field] = value;
    setSets(newSets);
  };

  // Save strength workout
  const saveStrengthWorkout = async () => {
    const name = standardizeName(exerciseName);
    if (!name) {
      showAlert("Lütfen hareket adı girin.");
      return;
    }

    const validSets = sets.filter(set => set.reps > 0 && set.weight > 0);
    if (validSets.length === 0) {
      showAlert("Lütfen en az bir geçerli set girin.");
      return;
    }

    try {
      await addDoc(collection(db, "users", user!.uid, "workouts"), {
        type: 'strength',
        name,
        sets: validSets,
        date: Timestamp.now()
      });
      showAlert("Antrenman başarıyla kaydedildi.", true);
      setExerciseName('');
      setSets([{ reps: 0, weight: 0 }]);
      setPerformanceInfo('');
      await fetchAllExerciseNames();
    } catch (error) {
      console.error("Güç antrenmanı ekleme hatası:", error);
      showAlert("Antrenman kaydedilemedi.");
    }
  };

  // Save cardio workout
  const saveCardioWorkout = async () => {
    const name = standardizeName(cardioName);
    const dur = parseInt(duration);
    const cal = parseInt(calories) || 0;
    
    if (!name || isNaN(dur)) {
      showAlert("Lütfen aktivite adı ve süreyi doldurun.");
      return;
    }
    
    try {
      await addDoc(collection(db, "users", user!.uid, "workouts"), {
        type: 'cardio',
        name,
        duration: dur,
        calories: cal,
        date: Timestamp.now()
      });
      showAlert("Kardiyo aktivitesi eklendi.", true);
      setCardioName('');
      setDuration('');
      setCalories('');
    } catch (error) {
      console.error("Kardiyo ekleme hatası:", error);
      showAlert("Kardiyo eklenemedi.");
    }
  };

  // Listen for daily logs
  const listenForDailyLogs = () => {
    if (!user) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const q = query(
      collection(db, "users", user.uid, "workouts"),
      where("date", ">=", Timestamp.fromDate(today)),
      where("date", "<", Timestamp.fromDate(tomorrow)),
      orderBy("date", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dailyWorkouts: Workout[] = [];
      snapshot.forEach((doc) => {
        dailyWorkouts.push({ id: doc.id, ...doc.data() } as Workout);
      });
      setWorkouts(dailyWorkouts);
    });

    return unsubscribe;
  };

  // Delete workout
  const deleteWorkout = async (workoutId: string) => {
    try {
      await deleteDoc(doc(db, "users", user!.uid, "workouts", workoutId));
      showAlert("Antrenman silindi.", true);
    } catch (error) {
      console.error("Antrenman silme hatası:", error);
      showAlert("Kayıt silinemedi.");
    }
  };

  // Show weight progress modal
  const showWeightProgress = async () => {
    if (!user) return;
    
    try {
      const q = query(
        collection(db, "users", user.uid, "weights"), 
        orderBy("date", "asc")
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setModalData({ title: 'Kilo Gelişimi', message: 'Geçmiş kilo kaydı bulunamadı.' });
        setShowProgressModal(true);
        return;
      }
      
      const labels: string[] = [];
      const data: number[] = [];
      
      snapshot.docs.reverse().forEach(docSnap => {
        const weightData = docSnap.data();
        if (weightData.date && weightData.weight) {
          const date = weightData.date.toDate();
          labels.push(date.toLocaleDateString('tr-TR'));
          data.push(weightData.weight);
        }
      });
      
      setModalData({
        title: 'Kilo Gelişimi',
        chartData: {
          labels,
          datasets: [{
            label: 'Kilo (kg)',
            data,
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            tension: 0.4
          }]
        }
      });
      setShowProgressModal(true);
    } catch (error) {
      console.error('Kilo grafik verisi alınırken hata:', error);
    }
  };

  // Show exercise progress modal
  const showExerciseProgress = async (exerciseName: string) => {
    if (!user) return;
    
    try {
      const snapshot = await getDocs(collection(db, 'users', user.uid, 'workouts'));
      const relevantWorkouts: any[] = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.type === 'strength' && data.name === exerciseName) {
          relevantWorkouts.push({ id: doc.id, ...data });
        }
      });

      if (relevantWorkouts.length === 0) {
        setModalData({ title: `${exerciseName} Gelişimi`, message: 'Bu hareket için veri bulunamadı.' });
        setShowProgressModal(true);
        return;
      }

      relevantWorkouts.sort((a, b) => {
        const dateA = a.date && typeof a.date.toMillis === 'function' ? a.date.toMillis() : 0;
        const dateB = b.date && typeof b.date.toMillis === 'function' ? b.date.toMillis() : 0;
        return dateA - dateB;
      });
      
      const labels: string[] = [];
      const data: number[] = [];
      
      relevantWorkouts.forEach(workout => {
        if (workout.date && workout.sets) {
          const date = workout.date.toDate();
          const bestSet = getBestSet(workout.sets);
          labels.push(date.toLocaleDateString('tr-TR'));
          data.push(bestSet.weight);
        }
      });
      
      setModalData({
        title: `${exerciseName} Gelişimi`,
        chartData: {
          labels,
          datasets: [{
            label: 'En İyi Ağırlık (kg)',
            data,
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            tension: 0.4
          }]
        }
      });
      setShowProgressModal(true);
    } catch (error) {
      console.error('Egzersiz grafik verisi alınırken hata:', error);
    }
  };

  const ProgressModal: React.FC = () => {
    if (!showProgressModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="glass-card w-full max-w-2xl p-6">
          <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
            <h3 className="text-xl font-semibold text-emerald-400">{modalData?.title}</h3>
            <button 
              onClick={() => setShowProgressModal(false)}
              className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
            >
              ×
            </button>
          </div>
          
          <div className="max-h-[70vh] overflow-y-auto">
            {modalData?.chartData ? (
              <div className="mb-4">
                <Line 
                  data={modalData.chartData} 
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: false,
                        grid: {
                          color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                          color: '#9ca3af'
                        }
                      },
                      x: {
                        grid: {
                          color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                          color: '#9ca3af'
                        }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-400">{modalData?.message}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-orange-500/20 via-transparent to-red-500/20 animate-aurora"></div>
      </div>
      
      <div className="max-w-3xl mx-auto p-4 sm:p-6 md:p-8">
        <header className="flex justify-between items-center mb-8">
          <div className="text-left">
            <div className="flex items-center gap-3">
              <i className="fas fa-dumbbell text-2xl text-orange-400"></i>
              <h1 className="text-3xl font-bold text-white tracking-wide">Fitness Paneli</h1>
            </div>
            <p className="text-gray-400 text-sm mt-1">Gelişimini hassasiyetle takip et</p>
          </div>
        </header>

        {/* Weight Tracker */}
        <div className="glass-card p-6 mb-6 fade-in">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <i className="fas fa-weight-scale text-blue-400"></i>
              Kilo Takibi
            </h2>
            <button 
              onClick={showWeightProgress}
              className="text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold py-2 px-3 rounded-lg transition backdrop-blur-sm"
            >
              Gelişimi Gör
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input 
              type="number" 
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="Bugünkü kilonuz (kg)" 
              className="form-input w-full"
            />
            <button 
              onClick={saveWeight}
              className="primary-btn w-full sm:w-auto flex-shrink-0"
            >
              Kaydet
            </button>
          </div>
          
          <div className="mt-3 text-sm text-gray-400 h-4">
            {lastWeight && lastWeight.date && (
              `Son kayıt (${lastWeight.date.toDate().toLocaleDateString('tr-TR')}): ${lastWeight.weight} kg`
            )}
          </div>
        </div>

        {/* Workout Logger */}
        <div className="glass-card p-6 mb-6 fade-in">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <i className="fas fa-dumbbell text-emerald-400"></i>
            Antrenman Kaydı
          </h2>
          
          <div className="flex mb-4 rounded-lg overflow-hidden text-sm">
            <button 
              onClick={() => setCurrentTab('strength')}
              className={`flex-1 p-3 font-medium transition-colors duration-300 ${
                currentTab === 'strength' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              <i className="fas fa-dumbbell mr-2"></i>
              Güç Antrenmanı
            </button>
            <button 
              onClick={() => setCurrentTab('cardio')}
              className={`flex-1 p-3 font-medium transition-colors duration-300 ${
                currentTab === 'cardio' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              <i className="fas fa-heart-pulse mr-2"></i>
              Kardiyo
            </button>
          </div>
          
          {currentTab === 'strength' ? (
            <div className="text-sm space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-2">Hareket Adı</label>
                <input 
                  type="text" 
                  value={exerciseName}
                  onChange={(e) => {
                    setExerciseName(e.target.value);
                    filterExercises(e.target.value);
                    fetchPerformanceInfo(e.target.value);
                  }}
                  onFocus={() => {
                    if (exerciseName) filterExercises(exerciseName);
                  }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  placeholder="Egzersiz adını yazın..." 
                  className="form-input w-full"
                  autoComplete="off"
                />
                
                {showDropdown && filteredExercises.length > 0 && (
                  <div className="absolute w-full bg-gray-800 border border-white/10 rounded-lg mt-1 max-h-48 overflow-y-auto z-10">
                    {filteredExercises.map(exercise => (
                      <div
                        key={exercise}
                        className="p-3 hover:bg-red-500/20 cursor-pointer text-gray-200 flex items-center transition-colors"
                        onClick={() => {
                          setExerciseName(exercise);
                          fetchPerformanceInfo(exercise);
                          setShowDropdown(false);
                          setFilteredExercises([]);
                        }}
                      >
                        <i className="fas fa-dumbbell mr-2 text-red-400 text-sm"></i>
                        {exercise}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="mt-2 text-sm text-emerald-400 h-10">
                  {performanceInfo}
                </div>
              </div>
              
              <div className="space-y-2">
                {sets.map((set, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-gray-500 font-medium">Set {index + 1}</span>
                    <input 
                      type="number" 
                      value={set.reps || ''}
                      onChange={(e) => updateSet(index, 'reps', parseInt(e.target.value) || 0)}
                      placeholder="Tekrar" 
                      className="form-input"
                    />
                    <input 
                      type="number" 
                      value={set.weight || ''}
                      onChange={(e) => updateSet(index, 'weight', parseFloat(e.target.value) || 0)}
                      placeholder="Ağırlık (kg)" 
                      className="form-input"
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={addSetRow}
                  className="w-full bg-gray-600/50 hover:bg-gray-600/70 text-gray-200 font-semibold py-3 px-4 rounded-lg transition duration-300 backdrop-blur-sm"
                >
                  Set Ekle
                </button>
                <button 
                  onClick={saveStrengthWorkout}
                  className="primary-btn w-full"
                >
                  Antrenmanı Kaydet
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input 
                  type="text" 
                  value={cardioName}
                  onChange={(e) => {
                    setCardioName(e.target.value);
                    filterExercises(e.target.value);
                  }}
                  onFocus={() => {
                    if (cardioName) filterExercises(cardioName);
                  }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  placeholder="Kardiyovasküler egzersiz yazın..." 
                  className="form-input md:col-span-1 w-full"
                />
                <input 
                  type="number" 
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Süre (dk)" 
                  className="form-input"
                />
                <input 
                  type="number" 
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Kalori (isteğe bağlı)" 
                  className="form-input"
                />
              </div>
              <button 
                onClick={saveCardioWorkout}
                className="primary-btn w-full"
              >
                Kardiyo Ekle
              </button>
            </div>
          )}
        </div>

        {/* Daily Log */}
        <div className="glass-card p-6 fade-in">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
            <i className="fas fa-calendar-day text-emerald-400"></i>
            Bugünkü Antrenman Günlüğü
          </h2>
          
          <div className="space-y-3">
            {workouts.length === 0 ? (
              <p className="text-gray-400 text-sm">Bugün için henüz bir aktivite eklenmedi.</p>
            ) : (
              workouts.map(workout => (
                <div 
                  key={workout.id} 
                  className="bg-gray-50 p-3 rounded-lg flex justify-between items-center fade-in text-sm border"
                >
                  <div className="flex-grow">
                    {workout.type === 'strength' ? (
                      <div>
                        <p className="font-semibold text-emerald-700">{workout.name}</p>
                        <p className="text-gray-500 text-xs">
                          {workout.sets?.length || 0} set 
                          {workout.sets && workout.sets.length > 0 && 
                            `(En iyi: ${formatSet(getBestSet(workout.sets))})`
                          }
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-sky-700">{workout.name}</p>
                        <p className="text-gray-500 text-xs">
                          {workout.duration} dakika
                          {workout.calories ? `, ${workout.calories} kalori` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {workout.type === 'strength' && (
                      <button 
                        onClick={() => showExerciseProgress(workout.name)}
                        className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold py-1 px-2 rounded-md transition"
                      >
                        Gelişim
                      </button>
                    )}
                    <button 
                      onClick={() => deleteWorkout(workout.id!)}
                      className="bg-red-100 hover:bg-red-200 text-red-700 font-bold w-7 h-7 rounded-md transition flex items-center justify-center flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      <ProgressModal />
    </div>
  );
};

export default Fitness;