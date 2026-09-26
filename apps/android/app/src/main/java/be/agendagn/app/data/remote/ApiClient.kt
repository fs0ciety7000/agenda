package be.agendagn.app.data.remote

import be.agendagn.app.data.auth.TokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

/** En-têtes communs : client mobile (jetons dans le corps) + en-tête anti-CSRF exigé par l'API. */
private class DefaultHeadersInterceptor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
            .header("X-Client", "mobile")
            .header("X-Requested-With", "agenda-gn")
        val access = runBlocking { tokens.accessToken() }
        if (access != null && chain.request().header("Authorization") == null) {
            builder.header("Authorization", "Bearer $access")
        }
        return chain.proceed(builder.build())
    }
}

/**
 * Sur 401 : un seul refresh (synchronisé), puis rejeu de la requête.
 * Échec du refresh ⇒ jetons effacés ⇒ l'app revient à l'écran de connexion.
 */
private class RefreshAuthenticator(
    private val tokens: TokenStore,
    private val refreshApi: () -> AgendaApi,
) : Authenticator {
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.startsWith("/v1/auth/")) return null
        if (response.priorResponse != null) return null // déjà rejouée une fois

        synchronized(lock) {
            val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")
            val current = runBlocking { tokens.accessToken() }
            // Un autre thread a déjà rafraîchi : on rejoue simplement avec le nouveau jeton.
            if (current != null && current != failedToken) {
                return response.request.newBuilder().header("Authorization", "Bearer $current").build()
            }
            val refresh = runBlocking { tokens.refreshToken() } ?: return null
            val result = runCatching { refreshApi().refreshBlocking(RefreshRequest(refresh)).execute() }.getOrNull()
            val body = result?.body()
            if (result?.isSuccessful != true || body?.accessToken == null || body.refreshToken == null) {
                runBlocking { tokens.clear() }
                return null
            }
            runBlocking { tokens.save(body.accessToken, body.refreshToken) }
            return response.request.newBuilder().header("Authorization", "Bearer ${body.accessToken}").build()
        }
    }
}

object ApiClient {
    fun create(baseUrl: String, tokens: TokenStore): AgendaApi {
        val converter = json.asConverterFactory("application/json".toMediaType())
        val plain = OkHttpClient.Builder()
            .addInterceptor(DefaultHeadersInterceptor(tokens))
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        val refreshApi by lazy {
            Retrofit.Builder().baseUrl(baseUrl).client(plain).addConverterFactory(converter).build()
                .create(AgendaApi::class.java)
        }
        val client = plain.newBuilder()
            .authenticator(RefreshAuthenticator(tokens) { refreshApi })
            .build()
        return Retrofit.Builder().baseUrl(baseUrl).client(client).addConverterFactory(converter).build()
            .create(AgendaApi::class.java)
    }
}
