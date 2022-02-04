FROM ubuntu:focal

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update -y && apt-get upgrade -y
RUN apt-get -y install python3 python3-pip default-jre-headless
RUN pip3 install transcrypt==3.9.0 htmltree==0.7.6

RUN mkdir /out
WORKDIR /out

ENTRYPOINT ["transcrypt"]