package app.tandem.foyer.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/** true = réseau disponible (bannière « Hors ligne » sinon). */
fun Context.observeOnline(): Flow<Boolean> = callbackFlow {
    val cm = getSystemService(ConnectivityManager::class.java)
    fun current() = cm.getNetworkCapabilities(cm.activeNetwork)
        ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { trySend(true) }
        override fun onLost(network: Network) { trySend(current()) }
    }
    trySend(current())
    cm.registerDefaultNetworkCallback(callback)
    awaitClose { cm.unregisterNetworkCallback(callback) }
}.distinctUntilChanged()
