// src/pages/InventoryPage.jsx
import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, serverTimestamp, increment, getDoc } from 'firebase/firestore'
import { Search, ChevronRight, Plus, X, Minus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const updatePointsAndLevel = async (userId, pointsToAdd, userProfile, setUserProfile) => {
    try {
        const userRef = doc(db, 'users', userId)
        const snap = await getDoc(userRef)
        if (!snap.exists()) return

        const newPoints = (snap.data().points || 0) + pointsToAdd
        let newLevel = 'Novato'
        if (newPoints >= 50) newLevel = 'Estudiante'
        if (newPoints >= 150) newLevel = 'Investigador Junior'
        if (newPoints >= 300) newLevel = 'Investigador Senior'
        if (newPoints >= 1000) newLevel = 'Maestro Científico'

        await updateDoc(userRef, { points: newPoints, level: newLevel })
        if (setUserProfile) {
            setUserProfile({ ...userProfile, points: newPoints, level: newLevel })
        }
    } catch (e) {
        console.warn('Could not update points:', e)
    }
}

export default function InventoryPage() {
    const { userProfile, user, setUserProfile } = useAuthStore()
    const [inventory, setInventory] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [filter, setFilter] = useState('Todos')
    const [viewAllGroups, setViewAllGroups] = useState(false)

    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState(null)
    const [movementAmount, setMovementAmount] = useState(1)

    // Form states
    const [newItem, setNewItem] = useState({ name: '', category: 'Reactivo', quantity: 0, unit: 'L', minStock: 1, location: '', expirationDate: '' })

    const userGroup = userProfile?.group || 'Laboratorio'
    const isAdmin = userProfile?.role === 'admin'

    useEffect(() => {
        let q = collection(db, 'inventory')

        if (!isAdmin || !viewAllGroups) {
            q = query(q, where('group', '==', userGroup))
        }

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setInventory(data)
        })

        return unsub
    }, [userGroup, isAdmin, viewAllGroups])

    const handleAddItem = async (e) => {
        e.preventDefault()
        if (!user) return
        try {
            const docRef = await addDoc(collection(db, 'inventory'), {
                ...newItem,
                group: userGroup,
                quantity: Number(newItem.quantity),
                minStock: Number(newItem.minStock),
                createdAt: serverTimestamp()
            })

            await addDoc(collection(db, 'inventory_movements'), {
                reagentId: docRef.id,
                reagentName: newItem.name,
                type: 'initial',
                amount: Number(newItem.quantity),
                userId: user.uid,
                userName: `${userProfile?.firstName} ${userProfile?.lastName}`,
                group: userGroup,
                date: serverTimestamp()
            })

            await addDoc(collection(db, 'audit_log'), {
                userId: user.uid,
                userName: `${userProfile?.firstName} ${userProfile?.lastName}`.trim(),
                action: 'inventory_created',
                detail: `Registró nuevo ítem: ${newItem.name}`,
                page: 'inventario',
                createdAt: serverTimestamp(),
            })

            // +5 points
            await updatePointsAndLevel(user.uid, 5, userProfile, setUserProfile)

            toast.success('Ítem añadido al inventario. +5 pts')
            setIsAddModalOpen(false)
            setNewItem({ name: '', category: 'Reactivo', quantity: 0, unit: 'L', minStock: 1, location: '', expirationDate: '' })
        } catch (err) {
            toast.error('Error al añadir ítem')
            console.error(err)
        }
    }

    const handleMovement = async (type) => {
        if (!selectedItem || !user || movementAmount <= 0) return

        const amount = type === 'add' ? movementAmount : -movementAmount

        if (type === 'subtract' && selectedItem.quantity + amount < 0) {
            toast.error('Stock insuficiente')
            return
        }

        try {
            await updateDoc(doc(db, 'inventory', selectedItem.id), {
                quantity: increment(amount)
            })

            await addDoc(collection(db, 'inventory_movements'), {
                reagentId: selectedItem.id,
                reagentName: selectedItem.name,
                type: type,
                amount: Math.abs(amount),
                userId: user.uid,
                userName: `${userProfile?.firstName} ${userProfile?.lastName}`,
                group: selectedItem.group,
                date: serverTimestamp()
            })

            await addDoc(collection(db, 'audit_log'), {
                userId: user.uid,
                userName: `${userProfile?.firstName} ${userProfile?.lastName}`.trim(),
                action: 'inventory_movement',
                detail: `Registró ${type === 'add' ? 'entrada' : 'salida'} de ${selectedItem.name} (${Math.abs(amount)})`,
                page: 'inventario',
                createdAt: serverTimestamp(),
            })

            // +5 points
            await updatePointsAndLevel(user.uid, 5, userProfile, setUserProfile)

            toast.success('Inventario actualizado. ¡+5 puntos!')
            setSelectedItem(null)
            setMovementAmount(1)
        } catch (err) {
            toast.error('Error al actualizar inventario')
            console.error(err)
        }
    }

    const filteredItems = inventory.filter(item => {
        if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) return false

        let status = 'ok'
        if (item.quantity <= item.minStock * 0.5) status = 'critical'
        else if (item.quantity <= item.minStock) status = 'low'

        if (filter === 'Crítico' && status !== 'critical') return false
        if (filter === 'Stock Bajo' && status !== 'low') return false
        if (filter === 'Por Vencer') {
            if (!item.expirationDate) return false
            const expDate = new Date(item.expirationDate)
            const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24))
            if (diffDays > 30 || diffDays < 0) return false
        }

        return true
    }).sort((a, b) => a.name.localeCompare(b.name))

    return (
        <div className="page-container" style={{ paddingBottom: '100px', position: 'relative' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E' }}>
                    Inventario {isAdmin && (
                        <span style={{ fontSize: '14px', marginLeft: '8px' }}>
                            {viewAllGroups ? 'Global' : `[${userGroup}]`}
                        </span>
                    )}
                    {!isAdmin && <span style={{ color: '#9B72CF', fontWeight: '600', fontSize: '18px', marginLeft: '8px' }}>[{userGroup}]</span>}
                </h1>

                {isAdmin && (
                    <button
                        onClick={() => setViewAllGroups(!viewAllGroups)}
                        style={{ background: viewAllGroups ? '#1A1A2E' : '#F1F5F9', color: viewAllGroups ? 'white' : '#1A1A2E', padding: '6px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                        {viewAllGroups ? 'Ver Mi Grupo' : 'Ver Todos'}
                    </button>
                )}
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
                <Search size={20} color="#9CA3AF" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar reactivos, consumibles..."
                    className="input-field"
                    style={{ paddingLeft: '44px', background: '#FFFFFF', borderRadius: '16px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', height: '52px' }}
                />
            </div>

            {/* Filter Chips */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', margin: '0 -16px', paddingLeft: '16px', paddingRight: '16px', scrollbarWidth: 'none' }}>
                {['Todos', 'Crítico', 'Stock Bajo', 'Por Vencer'].map((f) => (
                    <div key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '700', flexShrink: 0, cursor: 'pointer',
                            background: filter === f ? '#9B72CF' : '#FFFFFF',
                            color: filter === f ? '#FFFFFF' : '#666666',
                            border: filter === f ? 'none' : '1px solid #E0E0E0',
                            boxShadow: filter === f ? '0 4px 12px rgba(155,114,207,0.3)' : 'none'
                        }}>
                        {f}
                    </div>
                ))}
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredItems.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                        No se encontraron ítems en esta categoría.
                    </div>
                )}
                {filteredItems.map(item => {
                    let borderColor = '#34C759'
                    let badgeBg = '#E8F8ED'
                    let badgeColor = '#1A7A3A'
                    let badgeText = 'NORMAL'

                    if (item.quantity <= item.minStock * 0.5) {
                        borderColor = '#FF3B30'
                        badgeBg = '#FFF0EF'
                        badgeColor = '#CC0000'
                        badgeText = 'CRÍTICO'
                    } else if (item.quantity <= item.minStock) {
                        borderColor = '#FF9500'
                        badgeBg = '#FFF3E0'
                        badgeColor = '#CC5500'
                        badgeText = 'STOCK BAJO'
                    }

                    return (
                        <div key={item.id}
                            onClick={() => (!isAdmin && viewAllGroups) ? null : setSelectedItem(item)}
                            className="card" style={{ position: 'relative', overflow: 'hidden', padding: '16px 16px 16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: (!isAdmin && viewAllGroups) ? 'default' : 'pointer' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', background: borderColor }} />

                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ background: badgeBg, color: badgeColor, fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.05em' }}>
                                        {badgeText}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.category} • {item.group}</span>
                                </div>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 2px 0' }}>{item.name}</h3>
                                <p style={{ fontSize: '12px', color: '#666666', margin: 0 }}>Ubicación: {item.location || 'N/A'}</p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', paddingLeft: '8px' }}>
                                <span style={{ fontSize: '18px', fontWeight: '800', color: borderColor, whiteSpace: 'nowrap' }}>
                                    {item.quantity} {item.unit}
                                </span>
                                <ChevronRight size={18} color="#D1D5DB" />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Floating FAB for new item */}
            {(!viewAllGroups || isAdmin) && (
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    style={{
                        position: 'fixed', bottom: 'calc(var(--bottom-nav-h, 72px) + 16px)', right: '16px', width: '56px', height: '56px',
                        background: '#9B72CF', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 16px rgba(155, 114, 207, 0.4)', border: 'none', cursor: 'pointer', zIndex: 110
                    }}>
                    <Plus size={28} strokeWidth={2.5} />
                </button>
            )}

            {/* Modify Item Modal */}
            {selectedItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ background: '#FFF', width: '100%', maxWidth: '480px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '24px', animation: 'slideUp 0.3s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{selectedItem.name}</h2>
                            <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748B" /></button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#F8FAFC', borderRadius: '16px', marginBottom: '24px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#64748B' }}>Stock Actual</span>
                            <span style={{ fontSize: '24px', fontWeight: '800', color: '#1A1A2E' }}>{selectedItem.quantity} {selectedItem.unit}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                            <input
                                type="number"
                                min="1"
                                value={movementAmount}
                                onChange={(e) => setMovementAmount(Number(e.target.value))}
                                className="input-field"
                                style={{ flex: 1, fontSize: '18px', textAlign: 'center', fontWeight: '700' }}
                            />
                            <span style={{ fontSize: '18px', fontWeight: '700', color: '#64748B' }}>{selectedItem.unit}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <button
                                onClick={() => handleMovement('subtract')}
                                style={{ background: '#FEF2F2', color: '#EF4444', border: 'none', borderRadius: '16px', padding: '16px', fontSize: '15px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                                <Minus size={20} /> Retirar
                            </button>
                            <button
                                onClick={() => handleMovement('add')}
                                style={{ background: '#F0FDF4', color: '#22C55E', border: 'none', borderRadius: '16px', padding: '16px', fontSize: '15px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                                <Plus size={20} /> Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Item Modal */}
            {isAddModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Nuevo Reactivo</h2>
                            <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748B" /></button>
                        </div>
                        <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Nombre</label>
                                <input type="text" required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="input-field" />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Categoría</label>
                                    <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="input-field">
                                        <option>Reactivo</option>
                                        <option>Solvente</option>
                                        <option>Consumible</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Unidad</label>
                                    <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="input-field">
                                        <option>L</option>
                                        <option>mL</option>
                                        <option>g</option>
                                        <option>mg</option>
                                        <option>unidades</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Stock Actual</label>
                                    <input type="number" required min="0" step="any" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="input-field" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Stock Mínimo</label>
                                    <input type="number" required min="0" step="any" value={newItem.minStock} onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })} className="input-field" />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Ubicación Física</label>
                                <input type="text" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} className="input-field" placeholder="Ej. Estante A, Nevera 2" />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Fecha de Vencimiento (Opcional)</label>
                                <input type="date" value={newItem.expirationDate} onChange={(e) => setNewItem({ ...newItem, expirationDate: e.target.value })} className="input-field" />
                            </div>
                            <button type="submit" className="submit-button" style={{ marginTop: '8px', padding: '16px', borderRadius: '16px', border: 'none', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', cursor: 'pointer' }}>
                                Guardar en Inventario
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
