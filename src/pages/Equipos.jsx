import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { Lock } from 'lucide-react'

export default function Equipos() {
    const navigate = useNavigate()
    const [equipment, setEquipment] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const q = query(collection(db, 'equipment'), orderBy('sortOrder', 'asc'))

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))

            // Manual fallback if sortOrder is not yet fully populated
            const manualOrder = [
                "Cabina de Cultivo 1", "Cabina de Cultivo 2", "Cabina de Cultivo 3",
                "Cabina de Cultivo 4", "Cabina de Cultivo 5", "Cabina de Cultivo 6",
                "Cabina de Bacterias", "Cabina de Extracción",
                "Microscopio de Fluorescencia", "Termociclador PCR"
            ]

            items.sort((a, b) => {
                if (a.sortOrder && b.sortOrder) return a.sortOrder - b.sortOrder
                const idxA = manualOrder.indexOf(a.name)
                const idxB = manualOrder.indexOf(b.name)
                if (idxA !== -1 && idxB !== -1) return idxA - idxB
                if (idxA !== -1) return -1
                if (idxB !== -1) return 1
                return a.name.localeCompare(b.name)
            })

            setEquipment(items)
            setLoading(false)
        }, (error) => {
            console.error("Error fetching equipment:", error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [])

    const getStatusInfo = (status) => {
        switch (status) {
            case 'available':
                return { barColor: '#34C759', bgColor: '#E8FFF0', textColor: '#34C759', label: 'Disponible' }
            case 'occupied':
                return { barColor: '#FF3B30', bgColor: '#FFF0F0', textColor: '#FF3B30', label: 'En uso' }
            case 'reserved':
                return { barColor: '#FF9500', bgColor: '#FFF8E0', textColor: '#FF9500', label: 'Reserva próxima' }
            case 'maintenance':
                return { barColor: '#8E8E93', bgColor: '#F5F5F5', textColor: '#8E8E93', label: 'Mantenimiento' }
            default:
                return { barColor: '#8E8E93', bgColor: '#F5F5F5', textColor: '#8E8E93', label: 'Desconocido' }
        }
    }

    return (
        <div className="page-container" style={{ background: '#F5F5F5', minHeight: '100vh' }}>
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{
                    fontSize: '24px',
                    fontWeight: '800',
                    color: '#1A1A1A',
                    margin: '0 0 4px 0',
                    fontFamily: 'Manrope, sans-serif'
                }}>
                    Equipos
                </h1>
                <p style={{
                    fontSize: '14px',
                    color: '#666666',
                    margin: 0,
                    fontFamily: 'Manrope, sans-serif'
                }}>
                    Estado en tiempo real
                </p>
            </header>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <div className="w-8 h-8 border-4 border-[#9B72CF] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    {equipment.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#8E8E93' }}>
                            No hay equipos registrados.
                        </div>
                    ) : (
                        equipment.map((item) => {
                            const { barColor, bgColor, textColor, label } = getStatusInfo(item.status)
                            return (
                                <div
                                    key={item.id}
                                    className="card"
                                    onClick={() => navigate(`/equipos/${item.id}`)}
                                    style={{
                                        display: 'flex',
                                        padding: '0',
                                        overflow: 'hidden',
                                        position: 'relative',
                                        margin: 0,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {/* Left Bar */}
                                    <div style={{
                                        width: '4px',
                                        backgroundColor: barColor,
                                        flexShrink: 0
                                    }} />

                                    {/* Card Content */}
                                    <div style={{
                                        flex: 1,
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <h3 style={{
                                                fontSize: '15px',
                                                fontWeight: '800',
                                                color: '#1A1A1A',
                                                margin: 0
                                            }}>
                                                {item.name}
                                            </h3>

                                            {item.requiresCertification && (
                                                <div style={{
                                                    background: '#F0EBF8',
                                                    color: '#9B72CF',
                                                    fontSize: '11px',
                                                    fontWeight: '700',
                                                    padding: '4px 8px',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    <Lock size={10} /> Requiere certificación
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                            {/* Status Badge */}
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                color: textColor,
                                                backgroundColor: bgColor,
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                {label}
                                            </span>

                                            {item.status === 'occupied' && (item.currentUserName || item.currentUser) && (
                                                <span style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>
                                                    En uso por {item.currentUserName || item.currentUser}
                                                </span>
                                            )}

                                            {item.status === 'maintenance' && item.maintenanceNote && (
                                                <span style={{ fontSize: '12px', color: '#8E8E93', fontStyle: 'italic', marginTop: '2px' }}>
                                                    {item.maintenanceNote}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}
