FROM gcc:13 AS build
WORKDIR /src
COPY httplib.h json.hpp ./
COPY src/ src/
RUN g++ -std=c++20 -O2 -o engine src/main.cpp -lpthread

FROM debian:bookworm-slim
COPY --from=build /src/engine /usr/local/bin/engine
EXPOSE 7070
CMD ["engine", "7070"]
