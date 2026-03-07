// src/pages/InventoryPage.jsx
import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, orderBy, addDoc, updateDoc, doc, serverTimestamp, increment, getDoc, getDocs } from 'firebase/firestore'
import { Search, ChevronRight, Plus, X, Minus, Trash2, FileText, ArrowUpRight, ArrowDownRight, Edit2, Upload, History } from 'lucide-react'
import toast from 'react-hot-toast'
import { addAuditLog } from '../hooks/useAuth'
import { sendNotification } from '../hooks/useNotifications'
import { query as fsQuery, where as fsWhere, getDocs as fsGetDocs } from 'firebase/firestore'

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

    const [modalView, setModalView] = useState(null) // 'add', 'movement', 'detail', 'edit'
    const [selectedItem, setSelectedItem] = useState(null)
    const [selectedItemHistory, setSelectedItemHistory] = useState([])

    // Movement Form
    const [movementForm, setMovementForm] = useState({ type: 'Entrada', quantity: 1, notes: '', projectId: '' })
    const [projects, setProjects] = useState([])

    // Add/Edit Form states
    const [itemForm, setItemForm] = useState({ name: '', category: 'Reactivos químicos', quantity: 0, unit: 'mL', minStock: 1, location: '', expirationDate: '', group: '', notes: '' })

    const userGroup = userProfile?.group || 'Bioquímica'
    const isAdmin = userProfile?.role === 'admin'

    // Admins can switch groups; users are locked to their own
    const [selectedGroup, setSelectedGroup] = useState(userGroup)

    // If user profile loads after mount, sync the group
    useEffect(() => {
        if (userProfile?.group && !isAdmin) {
            setSelectedGroup(userProfile.group)
        }
    }, [userProfile?.group])

    useEffect(() => {
        if (!user) return
        const q = query(collection(db, 'projects'))
        const unsub = onSnapshot(q, (snap) => {
            const allProj = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            const myProj = allProj.filter(p => p.ownerId === user.uid || (p.collaborators || []).find(c => c.uid === user.uid))
            setProjects(myProj)
        })
        return unsub
    }, [user])

    useEffect(() => {
        if (!selectedGroup) return
        const q = query(collection(db, 'inventory', selectedGroup, 'reagents'))

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setInventory(data)
        }, (err) => {
            console.error('Inventory onSnapshot error:', err)
            toast.error('Error cargando inventario: ' + err.message)
        })

        return unsub
    }, [selectedGroup])

    useEffect(() => {
        if (selectedItem && modalView === 'detail') {
            const fetchHistory = async () => {
                const q = query(collection(db, 'inventory_movements'), where('reagentId', '==', selectedItem.id))
                const snap = await getDocs(q)
                const hist = snap.docs.map(d => d.data())
                // sort client-side to avoid needing index
                hist.sort((a, b) => {
                    const tA = a.date?.toMillis ? a.date.toMillis() : 0
                    const tB = b.date?.toMillis ? b.date.toMillis() : 0
                    return tB - tA
                })
                setSelectedItemHistory(hist)
            }
            fetchHistory()
        }
    }, [selectedItem, modalView])

    const duplicates = inventory.filter((item, index) =>
        inventory.findIndex(i => i.name.toLowerCase().trim() === item.name.toLowerCase().trim()) !== index
    )

    const handleConsolidate = async () => {
        if (!isAdmin || duplicates.length === 0) return
        const confirmMerge = window.confirm(`Se detectaron ${duplicates.length} duplicados. ¿Deseas fusionarlos todos sumando sus stocks?`)
        if (!confirmMerge) return

        const loadingToast = toast.loading('Fusionando registros...')
        try {
            const batch = writeBatch(db)
            const uniqueMap = {}

            inventory.forEach(item => {
                const key = item.name.toLowerCase().trim()
                if (!uniqueMap[key]) {
                    uniqueMap[key] = { ...item, idsToDelete: [] }
                } else {
                    uniqueMap[key].quantity += (item.quantity || 0)
                    uniqueMap[key].idsToDelete.push(item.id)
                }
            })

            for (const key in uniqueMap) {
                const master = uniqueMap[key]
                if (master.idsToDelete.length > 0) {
                    // Update master
                    batch.update(doc(db, 'inventory', selectedGroup, 'reagents', master.id), {
                        quantity: master.quantity,
                        updatedAt: serverTimestamp(),
                        name: master.name.charAt(0).toUpperCase() + master.name.slice(1).toLowerCase() // Normalize on merge
                    })
                    // Delete clones
                    master.idsToDelete.forEach(id => {
                        batch.delete(doc(db, 'inventory', selectedGroup, 'reagents', id))
                    })
                }
            }

            await batch.commit()
            toast.success('¡Inventario consolidado con éxito!', { id: loadingToast })
        } catch (err) {
            console.error(err)
            toast.error('Error al consolidar duplicados.', { id: loadingToast })
        }
    }

    const handleSaveItem = async (e) => {
        e.preventDefault()
        if (!user) return

        const targetGroup = itemForm.group || userGroup
        const trimmedName = itemForm.name.trim()
        const formattedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase()

        try {
            if (modalView === 'add') {
                const invSnap = await getDocs(collection(db, 'inventory', targetGroup, 'reagents'))
                const duplicateDoc = invSnap.docs.find(d => d.data().name?.trim().toLowerCase() === formattedName.toLowerCase())

                if (duplicateDoc) {
                    toast.error(`❌ El reactivo "${formattedName}" ya existe en este grupo. Por favor edita la entrada existente.`)
                    return
                }

                const docRef = await addDoc(collection(db, 'inventory', targetGroup, 'reagents'), {
                    ...itemForm,
                    name: formattedName,
                    group: targetGroup,
                    quantity: Number(itemForm.quantity),
                    minStock: Number(itemForm.minStock),
                    createdAt: serverTimestamp()
                })

                await addDoc(collection(db, 'inventory_movements'), {
                    reagentId: docRef.id,
                    reagentName: formattedName,
                    type: 'Entrada Inicial',
                    amount: Number(itemForm.quantity),
                    userId: user.uid,
                    userName: (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario'),
                    group: targetGroup,
                    date: serverTimestamp(),
                    notes: 'Inventario inicial'
                })

                await handleAuditLog('inventory_created', `Registró reactivo: ${formattedName}`)
                toast.success('Reactivo guardado en inventario.')
            } else if (modalView === 'edit') {
                const duplicateDoc = inventory.find(i => i.name.trim().toLowerCase() === formattedName.toLowerCase() && i.id !== selectedItem.id)
                if (duplicateDoc) {
                    toast.error(`❌ El reactivo "${formattedName}" ya existe en este grupo.`)
                    return
                }

                await updateDoc(doc(db, 'inventory', targetGroup, 'reagents', selectedItem.id), {
                    ...itemForm,
                    name: formattedName,
                    group: targetGroup,
                    quantity: Number(itemForm.quantity),
                    minStock: Number(itemForm.minStock)
                })
                toast.success('Reactivo actualizado.')
            }

            await updatePointsAndLevel(user.uid, 5, userProfile, setUserProfile)
            setModalView(null)
            setItemForm({ name: '', category: 'Reactivos químicos', quantity: 0, unit: 'mL', minStock: 1, location: '', expirationDate: '', group: userGroup, notes: '' })
        } catch (err) {
            console.error('Error saving inventory item:', err.code, err.message)
            if (err.code === 'permission-denied') {
                toast.error('Sin permisos para guardar. Verifica que tienes rol de Administrador y que las reglas de Firestore están desplegadas.')
            } else {
                toast.error('Error al guardar: ' + err.message)
            }
        }
    }

    const handleAuditLog = async (action, detail) => {
        const finalName = (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario')
        const userPhoto = userProfile?.photoURL || user?.photoURL || null
        await addAuditLog(user.uid, finalName, action, detail, 'inventario', userPhoto)
    }


    const handleMovement = async (e) => {
        e.preventDefault()
        if (!selectedItem || !user || movementForm.quantity <= 0) return

        const isSalida = movementForm.type === 'Salida'
        const amount = isSalida ? -movementForm.quantity : movementForm.quantity

        if (isSalida && selectedItem.quantity + amount < 0) {
            toast.error('Stock insuficiente para realizar esta salida')
            return
        }

        try {
            const newQuantity = selectedItem.quantity + amount
            let newStatus = 'ok'
            if (newQuantity <= selectedItem.minStock * 0.5) newStatus = 'critical'
            else if (newQuantity <= selectedItem.minStock) newStatus = 'low'

            await updateDoc(doc(db, 'inventory', selectedItem.group, 'reagents', selectedItem.id), {
                quantity: newQuantity,
                status: newStatus
            })

            await addDoc(collection(db, 'inventory_movements'), {
                reagentId: selectedItem.id,
                reagentName: selectedItem.name,
                type: movementForm.type,
                amount: movementForm.quantity,
                userId: user.uid,
                userName: (userProfile?.firstName && userProfile?.lastName) ? `${userProfile.firstName} ${userProfile.lastName}` : (user?.displayName || 'Usuario'),
                group: selectedItem.group,
                date: serverTimestamp(),
                notes: movementForm.notes,
                projectId: movementForm.projectId || null,
                projectName: projects.find(p => p.id === movementForm.projectId)?.name || null
            })

            await handleAuditLog('inventory_movement', `Registró ${movementForm.type.toLowerCase()} de ${selectedItem.name} (${movementForm.quantity})`)
            await updatePointsAndLevel(user.uid, 5, userProfile, setUserProfile)

            // Low Stock Notification
            if (newQuantity <= selectedItem.minStock) {
                try {
                    const adminsSnap = await fsGetDocs(fsQuery(collection(db, 'users'), fsWhere('role', 'in', ['admin', 'profesor'])))
                    const notifyPromises = adminsSnap.docs.map(adminDoc =>
                        sendNotification(adminDoc.id, {
                            type: 'low_stock',
                            message: `Stock bajo: ${selectedItem.name} tiene ${newQuantity} ${selectedItem.unit} restantes`
                        })
                    )
                    await Promise.allSettled(notifyPromises)
                } catch (err) {
                    console.warn('Could not notify low stock:', err)
                }
            }

            toast.success('Movimiento registrado. +5 pts')
            setModalView(null)
            setSelectedItem(null)
            setMovementForm({ type: 'Entrada', quantity: 1, notes: '' })
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
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#1A1A2E', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>Inventario</h1>
                    <div style={{ fontSize: '13px', color: '#9B72CF', fontWeight: '700' }}>{selectedGroup}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {isAdmin && duplicates.length > 0 && (
                        <button
                            onClick={handleConsolidate}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: '#EF4444', color: 'white',
                                border: 'none', borderRadius: '16px',
                                padding: '10px 20px', fontSize: '14px', fontWeight: '800',
                                cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.3)'
                            }}
                        >
                            <Trash2 size={18} />
                            Fusionar Duplicados ({duplicates.length})
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            onClick={() => {
                                setItemForm({ name: '', category: 'Reactivos químicos', quantity: 0, unit: 'mL', minStock: 1, location: '', expirationDate: '', group: selectedGroup, notes: '' })
                                setModalView('add')
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: '#9B72CF', color: 'white',
                                border: 'none', borderRadius: '16px',
                                padding: '10px 20px', fontSize: '14px', fontWeight: '800',
                                cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)'
                            }}
                        >
                            <Plus size={18} />
                            Agregar ítem
                        </button>
                    )}
                </div>
            </div>

            {/* Group Selector — Admins only */}
            {isAdmin && (
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Grupo de Inventario</div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {['Bioquímica', 'Neurobioquímica', 'Nutrición'].map(g => (
                            <button
                                key={g}
                                onClick={() => setSelectedGroup(g)}
                                style={{
                                    padding: '10px 20px', borderRadius: '16px', fontSize: '14px', fontWeight: '800',
                                    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                    background: selectedGroup === g ? '#1A1A2E' : '#F1F5F9',
                                    color: selectedGroup === g ? '#FFFFFF' : '#64748B',
                                    boxShadow: selectedGroup === g ? '0 4px 12px rgba(26,26,46,0.2)' : 'none'
                                }}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧪</div>
                        <div style={{ fontWeight: '800', fontSize: '18px', color: '#1A1A2E', marginBottom: '8px' }}>No hay ítems en este inventario</div>
                        <div style={{ fontSize: '14px', color: '#9CA3AF' }}>{isAdmin ? 'El administrador puede agregar reactivos o materiales a este inventario.' : 'Consulta con tu administrador para agregar ítems.'}</div>
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
                            onClick={() => {
                                setSelectedItem(item)
                                setModalView('detail')
                            }}
                            className="card" style={{ position: 'relative', overflow: 'hidden', padding: '16px 16px 16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
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

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', paddingLeft: '8px', flexShrink: 0 }}>
                                <span style={{ fontSize: '18px', fontWeight: '800', color: borderColor, whiteSpace: 'nowrap' }}>
                                    {item.quantity} {item.unit}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedItem(item)
                                        setModalView('movement')
                                    }}
                                    style={{ background: '#F5F5F5', color: '#9B72CF', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    MOVER <Plus size={12} />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>



            {/* Item Detail Modal */}
            {modalView === 'detail' && selectedItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ background: '#FFF', width: '100%', maxWidth: '480px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '24px', animation: 'slideUp 0.3s ease', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: '0 0 4px 0' }}>{selectedItem.name}</h2>
                                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', background: '#F1F5F9', padding: '4px 8px', borderRadius: '8px' }}>
                                    {selectedItem.category} | {selectedItem.group}
                                </span>
                            </div>
                            <button onClick={() => setModalView(null)} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={18} color="#666666" />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                            <div className="card" style={{ padding: '16px', background: '#F8FAFC', border: 'none', margin: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Stock Actual</div>
                                <div style={{ fontSize: '22px', fontWeight: '800', color: '#1A1A2E' }}>{selectedItem.quantity} {selectedItem.unit}</div>
                            </div>
                            <div className="card" style={{ padding: '16px', background: '#F8FAFC', border: 'none', margin: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Ubicación</div>
                                <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>{selectedItem.location || 'N/A'}</div>
                            </div>
                            <div className="card" style={{ padding: '16px', background: '#F8FAFC', border: 'none', margin: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Vencimiento</div>
                                <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>{selectedItem.expirationDate || 'N/A'}</div>
                            </div>
                            <div className="card" style={{ padding: '16px', background: '#F8FAFC', border: 'none', margin: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Stock Mínimo</div>
                                <div style={{ fontSize: '14px', fontWeight: '800', color: '#1A1A2E' }}>{selectedItem.minStock} {selectedItem.unit}</div>
                            </div>
                        </div>

                        {selectedItem.notes && (
                            <div className="card" style={{ padding: '16px', background: '#F8FAFC', border: 'none', marginBottom: '24px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Notas Adicionales</div>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A2E', whiteSpace: 'pre-wrap' }}>{selectedItem.notes}</div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                            <button
                                onClick={() => {
                                    setItemForm(selectedItem)
                                    setModalView('edit')
                                }}
                                style={{ background: '#F5F5F5', color: '#666666', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                                <Edit2 size={16} /> Editar
                            </button>
                            <button
                                onClick={() => toast.success('Función de carga de fichas u hojas de seguridad próximamente')}
                                style={{ background: '#E5F0FF', color: '#007AFF', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                                <Upload size={16} /> Subir SDS
                            </button>
                        </div>

                        {/* History */}
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1A1A2E', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <History size={18} /> Historial de Movimientos
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {selectedItemHistory.length === 0 ? (
                                <p style={{ fontSize: '13px', color: '#64748B', textAlign: 'center', padding: '12px' }}>No hay movimientos aún</p>
                            ) : (
                                selectedItemHistory.map((hist, idx) => (
                                    <div key={idx} style={{ padding: '12px', background: '#F8FAFC', borderRadius: '12px', borderLeft: `4px solid ${hist.type === 'Entrada' ? '#22C55E' : hist.type === 'Salida' ? '#EF4444' : '#9B72CF'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#1A1A2E' }}>
                                                {hist.type} <span style={{ color: '#64748B' }}>({hist.amount})</span>
                                            </span>
                                            <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: '700' }}>
                                                {hist.date?.toDate ? hist.date.toDate().toLocaleDateString() : 'Reciente'}
                                            </span>
                                        </div>
                                        <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#64748B' }}>{hist.userName}</p>
                                        {hist.notes && <p style={{ margin: 0, fontSize: '11px', color: '#1A1A2E', fontStyle: 'italic' }}>"{hist.notes}"</p>}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Movement Modal */}
            {modalView === 'movement' && selectedItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ background: '#FFF', width: '100%', maxWidth: '400px', borderRadius: '24px', padding: '24px', animation: 'fadeIn 0.2s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>Registrar Movimiento</h2>
                            <button onClick={() => setModalView(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748B" /></button>
                        </div>

                        <div style={{ marginBottom: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '12px', textAlign: 'center' }}>
                            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700' }}>{selectedItem.name}</span>
                            <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A2E' }}>Stock: {selectedItem.quantity} {selectedItem.unit}</div>
                        </div>

                        <form onSubmit={handleMovement} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Tipo de Movimiento</label>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                    <div
                                        onClick={() => setMovementForm({ ...movementForm, type: 'Entrada' })}
                                        style={{ flex: 1, padding: '12px', borderRadius: '12px', textAlign: 'center', fontWeight: '800', fontSize: '14px', cursor: 'pointer', background: movementForm.type === 'Entrada' ? '#E8F8ED' : '#F5F5F5', color: movementForm.type === 'Entrada' ? '#16A34A' : '#64748B', border: movementForm.type === 'Entrada' ? '2px solid #22C55E' : '2px solid transparent' }}
                                    >
                                        Entrada
                                    </div>
                                    <div
                                        onClick={() => setMovementForm({ ...movementForm, type: 'Salida' })}
                                        style={{ flex: 1, padding: '12px', borderRadius: '12px', textAlign: 'center', fontWeight: '800', fontSize: '14px', cursor: 'pointer', background: movementForm.type === 'Salida' ? '#FEF2F2' : '#F5F5F5', color: movementForm.type === 'Salida' ? '#EF4444' : '#64748B', border: movementForm.type === 'Salida' ? '2px solid #EF4444' : '2px solid transparent' }}
                                    >
                                        Salida
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Cantidad ({selectedItem.unit})</label>
                                <input type="number" required min="1" step="any" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: Number(e.target.value) })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Notas / Motivo</label>
                                <input type="text" value={movementForm.notes} onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })} className="input-field" placeholder="Ej. Práctica 1, Reabastecimiento..." style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                            </div>
                            {projects.length > 0 && (
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Vincular a Proyecto (Opcional)</label>
                                    <select
                                        value={movementForm.projectId}
                                        onChange={e => setMovementForm({ ...movementForm, projectId: e.target.value })}
                                        className="input-field"
                                        style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}
                                    >
                                        <option value="">Ninguno</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <button type="submit" style={{ marginTop: '8px', padding: '16px', borderRadius: '16px', border: 'none', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                                Confirmar Movimiento
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Add/Edit Item Modal */}
            {(modalView === 'add' || modalView === 'edit') && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A2E', margin: 0 }}>{modalView === 'add' ? 'Nuevo Reactivo' : 'Editar Reactivo'}</h2>
                            <button onClick={() => setModalView(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748B" /></button>
                        </div>
                        <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Nombre</label>
                                <input type="text" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Categoría</label>
                                    <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                        <option value="Reactivos químicos">Reactivos químicos</option>
                                        <option value="Anticuerpos">Anticuerpos</option>
                                        <option value="Soluciones buffer">Soluciones buffer</option>
                                        <option value="Kits de análisis">Kits de análisis</option>
                                        <option value="Enzimas">Enzimas</option>
                                        <option value="Tubos de ensayo">Tubos de ensayo</option>
                                        <option value="Placas de cultivo">Placas de cultivo</option>
                                        <option value="Materiales de laboratorio">Materiales de laboratorio</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Unidad</label>
                                    <input type="text" required value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="input-field" placeholder="mL, cajas..." style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Stock Actual</label>
                                    <input type="number" required min="0" step="any" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Stock Mínimo</label>
                                    <input type="number" required min="0" step="any" value={itemForm.minStock} onChange={(e) => setItemForm({ ...itemForm, minStock: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Ubicación Física</label>
                                <input type="text" value={itemForm.location} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })} className="input-field" placeholder="Ej. Estante A, Nevera 2" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Fecha de Vencimiento (Opcional)</label>
                                <input type="date" value={itemForm.expirationDate} onChange={(e) => setItemForm({ ...itemForm, expirationDate: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Notas Adicionales (Opcional)</label>
                                <textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', resize: 'vertical', minHeight: '80px' }} />
                            </div>

                            {isAdmin && (
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>Grupo Asignado (Admin)</label>
                                    <select value={itemForm.group || userGroup} onChange={(e) => setItemForm({ ...itemForm, group: e.target.value })} className="input-field" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                                        <option value="Laboratorio">Laboratorio General</option>
                                        <option value="Neurobioquímica">Neurobioquímica</option>
                                        <option value="Bioquímica">Bioquímica</option>
                                        <option value="Nutrición">Nutrición</option>
                                    </select>
                                </div>
                            )}

                            <button type="submit" className="submit-button" style={{ marginTop: '8px', padding: '16px', borderRadius: '16px', border: 'none', background: '#9B72CF', color: 'white', fontSize: '15px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(155,114,207,0.3)' }}>
                                {modalView === 'add' ? 'Guardar Reactivo' : 'Actualizar Reactivo'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
